import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { type CreatedWorkItem, WorkItemsRepository } from '../repositories/work-items.repository';

export interface RestoredWorkItem extends CreatedWorkItem {
  labelIds: string[];
}

/**
 * Soft-delete (trash) and restore a work item (US2, FR-WI-008, D12). Delete sets
 * `deleted_at` (default reads exclude it) and logs DELETED; restore clears it and logs
 * RESTORED — the item returns with its comments + history intact (nothing is hard-deleted).
 * RBAC: project:member. Both operations bump `version` for optimistic safety.
 */
@Injectable()
export class DeleteRestoreWorkItemProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  /** Soft-delete (trash). Idempotent: re-deleting an already-trashed item is a no-op. */
  async delete(id: string): Promise<void> {
    const existing = await this.workItems.findByIdIncludingDeleted(id);
    if (!existing) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(existing.item.projectId, 'MEMBER');
    await this.workItems.softDelete(id, this.tenant.getUserId() ?? null);
  }

  /** Restore from trash; returns the intact item (comments/history were never removed). */
  async restore(id: string): Promise<RestoredWorkItem> {
    const existing = await this.workItems.findByIdIncludingDeleted(id);
    if (!existing) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(existing.item.projectId, 'MEMBER');
    const restored = await this.workItems.restore(id, this.tenant.getUserId() ?? null);
    if (!restored) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    const labelIds = await this.workItems.labelIdsFor(id);
    return { ...restored, labelIds };
  }
}
