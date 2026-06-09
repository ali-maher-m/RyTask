import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TimeLog, UpdateTimeLogInput } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { type DurationFormInput, resolveEntry } from '../domain/duration.policy';
import { canEditTimeLog } from '../domain/time-edit-permission.policy';
import { toTimeLog } from '../domain/time.mapper';
import { TimeLogsRepository, type UpdateTimeLogData } from '../repositories/time-logs.repository';

/**
 * Edit a time entry (US4, FR-TT-003 — research D7/D9). Enforces the owner-or-admin permission policy
 * default-deny (a non-owner non-admin → `403`, nothing changes), re-validates any duration/form change
 * via `duration.policy` (a duration-only edit keeps the original start; a start/end edit merges with the
 * stored values), flips `classificationOverridden` when an explicit `classification` is supplied, and
 * appends a `TIME_EDITED {old,new}` row to the item activity feed through the work-items contract.
 */
@Injectable()
export class UpdateTimeLogProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenant: TenantContextService,
  ) {}

  async update(id: string, input: UpdateTimeLogInput): Promise<TimeLog> {
    const existing = await this.timeLogs.findById(id);
    if (!existing) throw new NotFoundException('time entry not found');
    const userId = this.tenant.getUserId();
    if (!userId) throw new ForbiddenException('no acting user in context');
    const isOrgAdmin = this.tenant.get().isOrgAdmin ?? false;
    if (!canEditTimeLog(existing, { userId, isOrgAdmin })) {
      throw new ForbiddenException('you can only edit your own time entries');
    }

    const data: UpdateTimeLogData = {};

    // Re-validate the duration/form only when the patch touches timing (research D5).
    const hasDuration = input.durationSeconds !== undefined;
    const hasStart = input.startedAt !== undefined;
    const hasEnd = input.endedAt !== undefined;
    if (hasDuration || hasStart || hasEnd) {
      if (hasDuration && (hasStart || hasEnd)) {
        throw new BadRequestException('Enter either a duration or a start and end time, not both.');
      }
      const form: DurationFormInput = hasDuration
        ? { durationSeconds: input.durationSeconds }
        : {
            startedAt: input.startedAt ?? existing.startedAt.toISOString(),
            endedAt: input.endedAt ?? existing.endedAt.toISOString(),
          };
      // A duration-only edit pins the original start (don't silently move it to midnight).
      const resolved = resolveEntry(
        form,
        this.clock.now(),
        hasDuration ? existing.startedAt : undefined,
      );
      if (!resolved.ok) throw new BadRequestException(resolved.message);
      data.startedAt = resolved.entry.startedAt;
      data.endedAt = resolved.entry.endedAt;
      data.durationSeconds = resolved.entry.durationSeconds;
    }

    if (input.note !== undefined) data.note = input.note;
    if (input.billable !== undefined) data.billable = input.billable;
    if (input.classification !== undefined) {
      data.classification = input.classification;
      data.classificationOverridden = true;
    }

    const updated = await this.timeLogs.update(id, data);
    if (!updated) throw new NotFoundException('time entry not found');

    await this.workItems.recordTimeEdited(
      existing.workItemId,
      userId,
      auditSnapshot(existing),
      auditSnapshot(updated),
    );
    return toTimeLog(updated);
  }
}

/** The fields worth recording in the `TIME_EDITED {old,new}` audit (who-changed-what, FR-TT-003). */
function auditSnapshot(row: {
  durationSeconds: number;
  note: string | null;
  billable: boolean;
  classification: string;
  startedAt: Date;
  endedAt: Date;
}) {
  return {
    durationSeconds: row.durationSeconds,
    note: row.note,
    billable: row.billable,
    classification: row.classification,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
  };
}
