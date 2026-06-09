import type { ActiveTimer, TimeLog } from '@rytask/contracts';
import type { TimeLogRow } from '../repositories/time-logs.repository';
import type { TimerRow } from '../repositories/timers.repository';

/**
 * Row → contract DTO mappers (the time-tracking equivalent of work-items' `work-item.mapper`).
 * One place turns `Date` columns into ISO strings so every controller/provider returns the exact
 * published shape (`@rytask/contracts`). Pure — no DB, no tenancy.
 */

/** A running `timers` row → the `ActiveTimer` the client re-syncs on load (derives elapsed from `startedAt`). */
export function toActiveTimer(row: TimerRow): ActiveTimer {
  return {
    id: row.id,
    workItemId: row.workItemId,
    startedAt: row.startedAt.toISOString(),
    note: row.note,
  };
}

/** A finalized `time_logs` row → the `TimeLog` DTO. */
export function toTimeLog(row: TimeLogRow): TimeLog {
  return {
    id: row.id,
    workItemId: row.workItemId,
    projectId: row.projectId,
    userId: row.userId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    durationSeconds: row.durationSeconds,
    note: row.note,
    billable: row.billable,
    source: row.source,
    classification: row.classification,
    classificationOverridden: row.classificationOverridden,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
