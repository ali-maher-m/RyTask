import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ActiveTimer } from '@rytask/contracts';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { deriveClassification } from '../domain/classification.policy';
import { decideStart } from '../domain/one-active-timer.policy';
import { toActiveTimer } from '../domain/time.mapper';
import { TimersRepository } from '../repositories/timers.repository';

/** Postgres unique-violation SQLSTATE — a racing second start hits `timers_org_user_unique`. */
const PG_UNIQUE_VIOLATION = '23505';
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Start (or switch) the caller's timer (US1, FR-TT-001/009 — research D3/D4). At most one active timer
 * per user: starting while idle inserts a row; starting on another item finalizes the running one into
 * a `time_log` then inserts the new (one transaction in the repo); starting on the item you're already
 * timing is a no-op. `started_at` comes from the server `CLOCK`, so the timer survives reload/restart.
 *
 * RBAC: the route requires `work:write`; this also asserts project membership via the projects contract
 * (org admins bypass) — exactly the work-items provider pattern. The write is wrapped in
 * `IdempotencyService.run`; under concurrency the `UNIQUE(org,user)` index is the real guard (a losing
 * racer's insert violates it and is resolved to the already-running timer — never two active timers).
 */
@Injectable()
export class StartTimerProvider {
  constructor(
    private readonly timers: TimersRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
    private readonly tenant: TenantContextService,
  ) {}

  async start(
    workItemId: string,
    note: string | null,
    idempotencyKey?: string,
  ): Promise<ActiveTimer> {
    const ctx = await this.workItems.getItemContext(workItemId);
    if (!ctx) throw new NotFoundException('work item not found');
    await this.projects.assertRole(ctx.projectId, 'MEMBER');
    const userId = this.tenant.getUserId();
    if (!userId) throw new ForbiddenException('no acting user in context');
    return this.idempotency.run(idempotencyKey, 'time.timer.start', () =>
      this.runStart(ctx.workspaceId, workItemId, userId, note),
    );
  }

  private async runStart(
    workspaceId: string,
    workItemId: string,
    userId: string,
    note: string | null,
  ): Promise<ActiveTimer> {
    const now = this.clock.now();
    const current = await this.timers.findActiveForUser(userId);

    if (!current) {
      // Idle start. If a concurrent start already won, the insert violates the unique index — resolve it.
      try {
        const row = await this.timers.create({
          workspaceId,
          workItemId,
          userId,
          startedAt: now,
          note,
        });
        await this.workItems.recordTimeStarted(workItemId, userId, now.toISOString());
        return toActiveTimer(row);
      } catch (err) {
        if (isUniqueViolation(err)) {
          const existing = await this.timers.findActiveForUser(userId);
          if (existing) return toActiveTimer(existing);
        }
        throw err;
      }
    }

    const decision = decideStart(
      { id: current.id, workItemId: current.workItemId, startedAt: current.startedAt },
      workItemId,
      now,
    );
    if (decision.kind !== 'switch') {
      // 'noop' — already running on this exact item; leave it accruing, return it unchanged. (A
      // non-null current never yields 'start', so this also covers that impossible case defensively.)
      return toActiveTimer(current);
    }

    // Switch: finalize the prior accrual into a `time_log`, then start the new timer (one transaction).
    const { finalize } = decision;
    const priorCtx = await this.workItems.getItemContext(finalize.workItemId);
    if (!priorCtx) {
      throw new NotFoundException("the running timer's work item no longer exists");
    }
    const { newTimer } = await this.timers.switchTimer(
      current,
      {
        projectId: priorCtx.projectId,
        endedAt: now,
        durationSeconds: finalize.durationSeconds,
        // Snapshot the class from the PRIOR item's priority — the switch finalizes that accrual
        // (research D6); the finalized entry belongs to the item being switched away from.
        classification: deriveClassification({ priority: priorCtx.priority }),
      },
      { workspaceId, workItemId, userId, startedAt: now, note },
    );
    await this.workItems.recordTimeStopped(finalize.workItemId, userId, finalize.durationSeconds);
    await this.workItems.recordTimeLogged(finalize.workItemId, userId, finalize.durationSeconds);
    await this.workItems.recordTimeStarted(workItemId, userId, now.toISOString());
    return toActiveTimer(newTimer);
  }
}
