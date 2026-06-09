import { Inject, Injectable } from '@nestjs/common';
import { timers, type Database, type TimeEntryClass, timeLogs } from '@rytask/db';
import { and, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { TimeLogRow } from './time-logs.repository';

export type TimerRow = typeof timers.$inferSelect;

export interface CreateTimerData {
  workspaceId: string;
  workItemId: string;
  userId: string;
  startedAt: Date;
  note?: string | null;
}

/**
 * What to write when a running timer is finalized into a `time_log` (stop or switch). `projectId`
 * is resolved by the provider from the timer's item (the timer row doesn't denormalize it);
 * `source` is always `TIMER`; `classification` is the snapshot the provider derives (US5 wires the
 * real policy — US1 passes the `PLANNED` baseline).
 */
export interface FinalizeTimerData {
  projectId: string;
  endedAt: Date;
  durationSeconds: number;
  classification: TimeEntryClass;
}

/**
 * Tenant-scoped reads/writes for `timers` (owned by the time-tracking module, data-model §2.1). A row
 * exists ONLY while a timer runs — there is no `deleted_at`; stopping/switching deletes it. The
 * one-active-timer-per-user invariant is the DB `UNIQUE(organization_id, user_id)` (research D3), so a
 * concurrent double-start surfaces as a unique-constraint violation the start provider catches (US1).
 * All access is `organization_id`-scoped via {@link TenantScopedRepository} (raw unscoped access is
 * forbidden by the architecture-boundary lint).
 */
@Injectable()
export class TimersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a running timer (tenant-scoped). Throws on `UNIQUE(org,user)` — the caller resolves it. */
  async create(data: CreateTimerData): Promise<TimerRow> {
    const [row] = await this.db
      .insert(timers)
      .values({
        organizationId: this.tenant.getOrgId(),
        workspaceId: data.workspaceId,
        workItemId: data.workItemId,
        userId: data.userId,
        startedAt: data.startedAt,
        note: data.note ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert timer');
    }
    return row;
  }

  /** The caller's single running timer (zero or one), tenant-scoped. */
  async findActiveForUser(userId: string): Promise<TimerRow | null> {
    const [row] = await this.db
      .select()
      .from(timers)
      .where(this.scoped(timers, eq(timers.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /** A timer by id (tenant-scoped), or null. */
  async findById(id: string): Promise<TimerRow | null> {
    const [row] = await this.db
      .select()
      .from(timers)
      .where(this.scoped(timers, eq(timers.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** Delete a timer row (tenant-scoped) — finalize/switch removes the transient running state. */
  async delete(id: string): Promise<void> {
    await this.db.delete(timers).where(this.scoped(timers, eq(timers.id, id)));
  }

  /**
   * Stop a running timer: insert its finalized `time_log` (`source = TIMER`) AND delete the timer row
   * in ONE transaction (data-model §2.1, time-tracking-flow.md §2). Atomicity matters — a crash
   * between the two would otherwise either lose the accrual or leave a running timer that double-counts
   * on the next stop. Both tables are time-tracking-owned, so a single repository transaction is correct.
   */
  async stop(timer: TimerRow, finalize: FinalizeTimerData): Promise<TimeLogRow> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx) => {
      const [log] = await tx
        .insert(timeLogs)
        .values(this.finalizedLogValues(orgId, timer, finalize))
        .returning();
      await tx.delete(timers).where(and(eq(timers.organizationId, orgId), eq(timers.id, timer.id)));
      if (!log) throw new Error('failed to finalize timer');
      return log;
    });
  }

  /**
   * Switch the active timer in ONE transaction (time-tracking-flow.md §1): finalize the `current`
   * timer into a `time_log`, delete it, then insert `next`. Deleting before inserting keeps the
   * `UNIQUE(organization_id, user_id)` invariant satisfied throughout — no two-active window.
   */
  async switchTimer(
    current: TimerRow,
    finalize: FinalizeTimerData,
    next: CreateTimerData,
  ): Promise<{ finalizedLog: TimeLogRow; newTimer: TimerRow }> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx) => {
      const [finalizedLog] = await tx
        .insert(timeLogs)
        .values(this.finalizedLogValues(orgId, current, finalize))
        .returning();
      await tx
        .delete(timers)
        .where(and(eq(timers.organizationId, orgId), eq(timers.id, current.id)));
      const [newTimer] = await tx
        .insert(timers)
        .values({
          organizationId: orgId,
          workspaceId: next.workspaceId,
          workItemId: next.workItemId,
          userId: next.userId,
          startedAt: next.startedAt,
          note: next.note ?? null,
        })
        .returning();
      if (!finalizedLog || !newTimer) throw new Error('failed to switch timer');
      return { finalizedLog, newTimer };
    });
  }

  /** The `time_logs` insert shape for a finalized timer — `source = TIMER`, attributed to its owner. */
  private finalizedLogValues(orgId: string, timer: TimerRow, finalize: FinalizeTimerData) {
    return {
      organizationId: orgId,
      workspaceId: timer.workspaceId,
      projectId: finalize.projectId,
      workItemId: timer.workItemId,
      userId: timer.userId,
      startedAt: timer.startedAt,
      endedAt: finalize.endedAt,
      durationSeconds: finalize.durationSeconds,
      note: timer.note,
      source: 'TIMER' as const,
      classification: finalize.classification,
    };
  }
}
