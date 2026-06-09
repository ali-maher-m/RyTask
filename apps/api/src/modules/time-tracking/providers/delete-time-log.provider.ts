import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { canEditTimeLog } from '../domain/time-edit-permission.policy';
import { toTimeLog } from '../domain/time.mapper';
import { TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * Delete a time entry (US4, FR-TT-003 — research D9/D15). Enforces the owner-or-admin permission policy
 * default-deny (a non-owner non-admin → `403`, nothing changes). The delete is **soft** (`deleted_at`),
 * so the entry is recoverable but drops out of the meter, lists, and aggregations immediately; a
 * `TIME_DELETED {old}` row is appended to the item activity feed through the work-items contract.
 */
@Injectable()
export class DeleteTimeLogProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenant: TenantContextService,
  ) {}

  async delete(id: string): Promise<void> {
    const existing = await this.timeLogs.findById(id);
    if (!existing) throw new NotFoundException('time entry not found');
    const userId = this.tenant.getUserId();
    if (!userId) throw new ForbiddenException('no acting user in context');
    const isOrgAdmin = this.tenant.get().isOrgAdmin ?? false;
    if (!canEditTimeLog(existing, { userId, isOrgAdmin })) {
      throw new ForbiddenException('you can only delete your own time entries');
    }

    const deleted = await this.timeLogs.softDelete(id, this.clock.now());
    if (!deleted) throw new NotFoundException('time entry not found');
    await this.workItems.recordTimeDeleted(existing.workItemId, userId, toTimeLog(existing));
  }
}
