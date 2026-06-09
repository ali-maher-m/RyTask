import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TimeLog } from '@rytask/contracts';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { deriveClassification } from '../domain/classification.policy';
import { elapsedSeconds } from '../domain/one-active-timer.policy';
import { toTimeLog } from '../domain/time.mapper';
import { TimersRepository } from '../repositories/timers.repository';

/**
 * Stop the caller's running timer (US1, FR-TT-009 — research D4/D13). Computes
 * `durationSeconds = round(clock.now() − startedAt)` server-side, inserts the finalized `time_log`
 * (`source = TIMER`), and deletes the `timers` row — one transaction in the repo. The timer must
 * belong to `principal.userId` (else `404`). Wrapped in `IdempotencyService.run`: a retried stop with
 * the same `Idempotency-Key` returns the SAME finalized log (cached) — time is counted exactly once.
 */
@Injectable()
export class StopTimerProvider {
  constructor(
    private readonly timers: TimersRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
    private readonly tenant: TenantContextService,
  ) {}

  async stop(timerId: string, idempotencyKey?: string): Promise<TimeLog> {
    const userId = this.tenant.getUserId();
    if (!userId) throw new ForbiddenException('no acting user in context');
    return this.idempotency.run(idempotencyKey, 'time.timer.stop', () =>
      this.runStop(timerId, userId),
    );
  }

  private async runStop(timerId: string, userId: string): Promise<TimeLog> {
    const timer = await this.timers.findById(timerId);
    // Tenant-scoped findById already filters by org; ownership makes another user's timer a 404.
    if (!timer || timer.userId !== userId) {
      throw new NotFoundException('no active timer to stop');
    }
    const ctx = await this.workItems.getItemContext(timer.workItemId);
    if (!ctx) throw new NotFoundException("the timer's work item no longer exists");

    const now = this.clock.now();
    const durationSeconds = elapsedSeconds(timer.startedAt, now);
    const log = await this.timers.stop(timer, {
      projectId: ctx.projectId,
      endedAt: now,
      durationSeconds,
      // Snapshot the class from the item's priority at finalize time (research D6 — a timer entry is
      // never overridden at the source; an explicit override is an edit afterward).
      classification: deriveClassification({ priority: ctx.priority }),
    });
    await this.workItems.recordTimeStopped(timer.workItemId, userId, durationSeconds);
    await this.workItems.recordTimeLogged(timer.workItemId, userId, durationSeconds);
    return toTimeLog(log);
  }
}
