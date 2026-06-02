import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { UpdateWorkItem } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { type FieldDiff, diffWorkItemFields } from '../domain/activity-diff.policy';
import { evaluateParenting } from '../domain/hierarchy.policy';
import {
  type CreatedWorkItem,
  type FieldChange,
  type UpdateWorkItemColumns,
  WorkItemsRepository,
} from '../repositories/work-items.repository';

export interface UpdateWorkItemResult extends CreatedWorkItem {
  labelIds: string[];
  /** Field names that actually changed — drives event emission (no-op edits notify no one). */
  changedFields: string[];
}

/** Status categories that mean the work is finished (completed_at is set). */
const COMPLETED_CATEGORY = 'COMPLETED';

/**
 * Edit a work item's fields (US2, FR-WI-003/006/009, FR-DATE-001/002, FR-PRIO-001). One
 * transaction (in the repository): version check → apply changed columns + bump version →
 * append one UPDATED activity row per changed field (a status change is logged as
 * STATUS_CHANGED). A stale `version` raises a conflict (the controller maps it to 409). A
 * status transition applies the completed_at rule (set on entering a COMPLETED category,
 * cleared on leaving). Board drag-reordering (`position`) is the move provider's job (US3);
 * here a status change has no position semantics. RBAC: project:member.
 */
@Injectable()
export class UpdateWorkItemProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async update(id: string, input: UpdateWorkItem): Promise<UpdateWorkItemResult> {
    const existing = await this.workItems.findById(id);
    if (!existing) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(existing.item.projectId, 'MEMBER');

    const before = existing.item;

    // Cross-field validation lives here (not via a Zod .refine — TS2589). When both
    // start and end are present (after applying the patch), start must be <= end.
    const nextStart = 'startDate' in input ? (input.startDate ?? null) : before.startDate;
    const nextEnd = 'endDate' in input ? (input.endDate ?? null) : before.endDate;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    // Build the column patch + the before/after maps for the diff (only provided keys).
    const columns: UpdateWorkItemColumns = {};
    const beforeMap: Record<string, string | number | boolean | null> = {};
    const afterMap: Record<string, string | number | boolean | null> = {};

    if ('title' in input && input.title !== undefined) {
      columns.title = input.title;
      beforeMap.title = before.title;
      afterMap.title = input.title;
    }
    if ('description' in input) {
      const next = input.description ?? null;
      columns.description = next;
      beforeMap.description = before.description;
      afterMap.description = next;
    }
    if ('priority' in input && input.priority !== undefined) {
      columns.priority = input.priority;
      beforeMap.priority = before.priority;
      afterMap.priority = input.priority;
    }
    if ('statusId' in input && input.statusId !== undefined && input.statusId !== before.statusId) {
      columns.statusId = input.statusId;
      beforeMap.statusId = before.statusId;
      afterMap.statusId = input.statusId;
      // The target status must belong to THIS item's project — `statusInfo` is only org-scoped,
      // so without the project check a board could be corrupted with another project's column.
      const status = await this.workItems.statusInfo(input.statusId);
      if (!status || status.projectId !== before.projectId) {
        throw new UnprocessableEntityException("status does not belong to this item's project");
      }
      // completed_at rule (data-model §2.5): set when entering a COMPLETED-category status,
      // cleared when leaving it.
      const enteringCompleted = UpdateWorkItemProvider.isCompletedCategory(status.category);
      if (enteringCompleted && !before.completedAt) {
        columns.completedAt = this.clock.now();
      } else if (!enteringCompleted && before.completedAt) {
        columns.completedAt = null;
      }
    }
    if ('assigneeId' in input) {
      const next = input.assigneeId ?? null;
      columns.assigneeId = next;
      beforeMap.assigneeId = before.assigneeId;
      afterMap.assigneeId = next;
    }
    if ('parentId' in input) {
      const next = input.parentId ?? null;
      // Re-parenting must be validated BEFORE writing (FR-HIER-001): the policy was previously
      // only applied on add-subtask, so a PATCH could set a descendant as the parent (a cycle)
      // or a parent in another project. Only validate an actual change to a non-null parent.
      if (next !== null && next !== before.parentId) {
        await this.assertValidParent({ id, projectId: before.projectId }, next);
      }
      columns.parentId = next;
      beforeMap.parentId = before.parentId;
      afterMap.parentId = next;
    }
    if ('estimateValue' in input) {
      const next = input.estimateValue ?? null;
      columns.estimateValue = next != null ? String(next) : null;
      beforeMap.estimateValue = before.estimateValue != null ? Number(before.estimateValue) : null;
      afterMap.estimateValue = next;
    }
    if ('startDate' in input) {
      const next = input.startDate ?? null;
      columns.startDate = next;
      beforeMap.startDate = before.startDate;
      afterMap.startDate = next;
    }
    if ('endDate' in input) {
      const next = input.endDate ?? null;
      columns.endDate = next;
      beforeMap.endDate = before.endDate;
      afterMap.endDate = next;
    }
    if ('dueDate' in input) {
      const next = input.dueDate ?? null;
      columns.dueDate = next;
      beforeMap.dueDate = before.dueDate;
      afterMap.dueDate = next;
    }

    const diffs: FieldDiff[] = diffWorkItemFields(beforeMap, afterMap);
    const changes: FieldChange[] = diffs.map((d) => ({
      field: d.field,
      oldValue: d.oldValue ?? null,
      newValue: d.newValue ?? null,
      action: d.field === 'statusId' ? ('STATUS_CHANGED' as const) : undefined,
    }));

    const actorId = this.tenant.getUserId() ?? null;
    const updated = await this.workItems.updateFields(id, input.version, columns, changes, actorId);

    const labelIds = await this.workItems.labelIdsFor(id);
    return { ...updated, labelIds, changedFields: diffs.map((d) => d.field) };
  }

  /**
   * Validate a (re)parenting before writing (FR-HIER-001): the parent must exist, live in the
   * same project, and not create a self/cycle link or exceed the nesting depth (the item may
   * carry its own subtree). Rejections map to 422 (UnprocessableEntity).
   */
  private async assertValidParent(
    item: { id: string; projectId: string },
    parentId: string,
  ): Promise<void> {
    const parent = await this.workItems.findById(parentId);
    if (!parent) {
      throw new UnprocessableEntityException('parent work item not found');
    }
    if (parent.item.projectId !== item.projectId) {
      throw new UnprocessableEntityException(
        'a sub-task must be in the same project as its parent',
      );
    }
    const decision = evaluateParenting({
      itemId: item.id,
      parentId,
      parentAncestorIds: await this.workItems.ancestorIds(parentId),
      subtreeHeight: await this.workItems.subtreeHeight(item.id),
    });
    if (!decision.ok) {
      throw new UnprocessableEntityException(decision.message);
    }
  }

  /** Whether a status category means the item is completed (used by the move path, US3). */
  static isCompletedCategory(category: string | null): boolean {
    return category === COMPLETED_CATEGORY;
  }
}
