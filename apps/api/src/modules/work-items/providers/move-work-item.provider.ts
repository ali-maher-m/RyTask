import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { MoveWorkItem } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import {
  type CreatedWorkItem,
  type FieldChange,
  WorkItemsRepository,
} from '../repositories/work-items.repository';

export interface MoveWorkItemResult extends CreatedWorkItem {
  labelIds: string[];
  /** Field names that actually changed (e.g. `statusId`, `position`) — drives event emission. */
  changedFields: string[];
}

/** Default gap when placing relative to a single neighbour (research D13). */
const STEP = 1024;

/**
 * Move a work item on the board (US3, FR-VIEW-001): change its status column and/or its
 * fractional `position` between two siblings. One transaction (in the repository):
 * version check → apply column changes + bump version → append STATUS_CHANGED (when the
 * column changes) and/or MOVED (when the rank changes) activity. A stale `version` raises
 * a conflict (the controller maps it to 409). Entering a COMPLETED-category status sets
 * `completed_at`; leaving it clears it. RBAC: project:member.
 */
@Injectable()
export class MoveWorkItemProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async move(id: string, input: MoveWorkItem): Promise<MoveWorkItemResult> {
    const existing = await this.workItems.findById(id);
    if (!existing) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(existing.item.projectId, 'MEMBER');
    const before = existing.item;

    const columns: { statusId?: string; position?: string; completedAt?: Date | null } = {};
    const changes: FieldChange[] = [];

    // ── status column change + completed_at rule (data-model §2.5) ───────────────
    const targetStatusId = input.statusId ?? before.statusId;
    const statusChanged = input.statusId !== undefined && input.statusId !== before.statusId;
    if (statusChanged) {
      columns.statusId = input.statusId;
      changes.push({
        field: 'statusId',
        oldValue: before.statusId,
        newValue: input.statusId,
        action: 'STATUS_CHANGED',
      });
      // The target status must belong to THIS item's project (statusInfo is org-scoped) — without
      // the project check a card could be dropped into another project's column.
      const status = await this.workItems.statusInfo(input.statusId as string);
      if (!status || status.projectId !== before.projectId) {
        throw new UnprocessableEntityException(
          "target status does not belong to this item's project",
        );
      }
      const enteringCompleted = status.category === 'COMPLETED';
      if (enteringCompleted && !before.completedAt) {
        columns.completedAt = this.clock.now();
      } else if (!enteringCompleted && before.completedAt) {
        columns.completedAt = null;
      }
    }

    // ── fractional position between neighbours (research D13) ────────────────────
    const nextPosition = await this.computePosition(input, before.position);
    if (nextPosition !== null) {
      columns.position = String(nextPosition);
      changes.push({
        field: 'position',
        oldValue: before.position != null ? Number(before.position) : null,
        newValue: nextPosition,
        action: 'MOVED',
      });
    }

    if (Object.keys(columns).length === 0) {
      // Nothing actually changed; still version-checked to honour optimistic concurrency.
      const labelIds = await this.workItems.labelIdsFor(id);
      const moved = await this.workItems.moveItem(id, input.version, {}, [], null);
      return { ...moved, labelIds, changedFields: [] };
    }

    const actorId = this.tenant.getUserId() ?? null;
    const moved = await this.workItems.moveItem(id, input.version, columns, changes, actorId);
    const labelIds = await this.workItems.labelIdsFor(id);
    return { ...moved, labelIds, changedFields: changes.map((c) => c.field) };
  }

  /**
   * Compute the new fractional position from the drop anchors. `afterId`/`beforeId` are
   * the siblings the card is dropped after/before. Returns null when there is no rank
   * change to apply (e.g. a pure status move with no anchors keeps the current position).
   */
  private async computePosition(
    input: MoveWorkItem,
    currentPosition: string | null,
  ): Promise<number | null> {
    const after = input.afterId ? await this.workItems.positionOf(input.afterId) : null;
    const before = input.beforeId ? await this.workItems.positionOf(input.beforeId) : null;

    if (after !== null && before !== null) {
      return (after + before) / 2;
    }
    if (after !== null) {
      return after + STEP;
    }
    if (before !== null) {
      return before - STEP;
    }
    // No usable anchor. If the card had no rank yet, seed one so the board stays stable.
    if ((input.afterId || input.beforeId) && currentPosition == null) {
      return STEP;
    }
    return null;
  }
}
