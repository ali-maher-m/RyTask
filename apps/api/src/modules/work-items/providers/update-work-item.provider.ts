import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateWorkItem } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { type FieldDiff, diffWorkItemFields } from '../domain/activity-diff.policy';
import {
  type CreatedWorkItem,
  type FieldChange,
  type UpdateWorkItemColumns,
  WorkItemsRepository,
} from '../repositories/work-items.repository';

export interface UpdateWorkItemResult extends CreatedWorkItem {
  labelIds: string[];
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
      // completed_at rule (data-model §2.5): set when entering a COMPLETED-category
      // status, cleared when leaving it. Categories are read tenant-scoped.
      const nextCategory = await this.workItems.statusCategory(input.statusId);
      const enteringCompleted = UpdateWorkItemProvider.isCompletedCategory(nextCategory);
      if (enteringCompleted && !before.completedAt) {
        columns.completedAt = new Date();
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
    return { ...updated, labelIds };
  }

  /** Whether a status category means the item is completed (used by the move path, US3). */
  static isCompletedCategory(category: string | null): boolean {
    return category === COMPLETED_CATEGORY;
  }
}
