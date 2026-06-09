import { z } from 'zod';

/**
 * Time-tracking DTOs (M2, the flagship — single contract source; OpenAPI `TimeLog`/`ActiveTimer`).
 * Durations are integer **seconds**; timestamps ISO `timestamptz`; ids UUIDv7. The cross-field rules
 * (duration XOR start/end; `ended > started`; `0 < duration ≤ cap`) are enforced in `duration.policy`
 * server-side, NOT via a Zod `.refine` here (a `.refine` produces a pathologically deep `ZodEffects`
 * type that blows up `tsc`, TS2589 — same reason the work-items contract keeps cross-field rules out).
 */

/** How a time entry was logged (research D14). M2 produces only TIMER | MANUAL; the rest are v2. */
export const TIME_ENTRY_SOURCES = ['TIMER', 'MANUAL', 'SLACK', 'MCP', 'API'] as const;
export const timeEntrySourceSchema = z.enum(TIME_ENTRY_SOURCES);
export type TimeEntrySource = z.infer<typeof timeEntrySourceSchema>;

/** Planned vs interruption (FR-TT-006, research D6). Planned + interruption always sum to total. */
export const TIME_ENTRY_CLASSES = ['PLANNED', 'INTERRUPTION'] as const;
export const timeEntryClassSchema = z.enum(TIME_ENTRY_CLASSES);
export type TimeEntryClass = z.infer<typeof timeEntryClassSchema>;

/** ISO `YYYY-MM-DD` calendar date (for a duration-only manual entry's `date`). */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * The caller's single in-progress timer (US1, research D4). The client derives live elapsed as
 * `now − startedAt` and re-fetches this on load so a running timer survives reload/restart.
 */
export interface ActiveTimer {
  id: string;
  workItemId: string;
  startedAt: string; // ISO; client derives live elapsed = now − startedAt
  note: string | null;
}

/** A finalized time entry (the atomic unit of all aggregation). `source` is set server-side. */
export interface TimeLog {
  id: string;
  workItemId: string;
  projectId: string;
  userId: string | null; // null = attribution lost (removed user)
  startedAt: string;
  endedAt: string;
  durationSeconds: number; // integer, > 0
  note: string | null;
  billable: boolean;
  source: TimeEntrySource; // set server-side (TIMER from stop, MANUAL from the manual endpoint)
  classification: TimeEntryClass;
  classificationOverridden: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * POST /work-items/{id}/timer/start — optional carry-over note. `startedAt` is set server-side from
 * the `CLOCK` (never client-supplied). Unknown fields rejected (`.strict`).
 */
export const startTimerSchema = z.object({ note: z.string().max(2000).optional() }).strict();
export type StartTimerInput = z.infer<typeof startTimerSchema>;

/**
 * POST /work-items/{id}/time-logs — a manual entry: EITHER `durationSeconds` OR (`startedAt` +
 * `endedAt`); a duration-only entry uses `date` (default today, server TZ) for the day. `source` is
 * forced to MANUAL server-side; `classification` is derived unless supplied (then `overridden = true`).
 * The duration-vs-start/end XOR + bounds are validated by `duration.policy` (TS2589 — see header).
 */
export const createTimeLogSchema = z
  .object({
    durationSeconds: z.number().int().positive().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    date: dateString.optional(),
    note: z.string().max(2000).optional(),
    billable: z.boolean().optional(),
    classification: timeEntryClassSchema.optional(),
  })
  .strict();
export type CreateTimeLogInput = z.infer<typeof createTimeLogSchema>;

/**
 * PATCH /time-logs/{id} — owner-or-admin edit (US4). Re-validates duration/forms; setting
 * `classification` flips `classificationOverridden = true`. Unknown fields rejected (`.strict`).
 */
export const updateTimeLogSchema = z
  .object({
    durationSeconds: z.number().int().positive().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().optional(),
    note: z.string().max(2000).nullable().optional(),
    billable: z.boolean().optional(),
    classification: timeEntryClassSchema.optional(),
  })
  .strict();
export type UpdateTimeLogInput = z.infer<typeof updateTimeLogSchema>;

/**
 * GET /work-items/{id}/time-logs query params (US3/US4) — keyset cursor pagination (`cursor`/`limit`),
 * newest first, soft-deleted excluded. Mirrors `listWorkItemsQuerySchema`. Unknown fields rejected.
 */
export const listTimeLogsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .strict();
export type ListTimeLogsQuery = z.infer<typeof listTimeLogsQuerySchema>;

/** GET /time/rollup?projectId= — per-item totals for the in-row meter (US2, research D11). */
export const timeRollupQuerySchema = z.object({ projectId: z.string().uuid() }).strict();
export type TimeRollupQuery = z.infer<typeof timeRollupQuerySchema>;

/** One item's logged total (the row-meter read-model). */
export interface ItemRollup {
  workItemId: string;
  loggedSeconds: number;
}

/**
 * GET /time/summary — totals grouped by the requested axis, day/week bucketed, split planned vs
 * interruption (US7, research D10). `userId = principal.userId` ⇒ the "my time" view. Unknown fields
 * rejected (`.strict`); `from`/`to` are `YYYY-MM-DD`.
 */
export const timeSummaryQuerySchema = z
  .object({
    groupBy: z.enum(['item', 'user', 'project', 'period']),
    period: z.enum(['day', 'week']).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    projectId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();
export type TimeSummaryQuery = z.infer<typeof timeSummaryQuerySchema>;

/** One summary row. `plannedSeconds + interruptionSeconds === loggedSeconds` (SC-005). */
export interface TimeSummaryRow {
  key: string; // the group key (itemId | userId | projectId | period bucket)
  loggedSeconds: number;
  plannedSeconds: number;
  interruptionSeconds: number;
}

/** GET /timers/active envelope (zero-or-one). */
export interface ActiveTimerResponse {
  data: ActiveTimer | null;
}

/** Single time-log envelope: `{ data }` (start-stop → finalized log, manual create, edit). */
export interface TimeLogEnvelope {
  data: TimeLog;
}

/** Time-log list envelope: `{ data, pageInfo }` (keyset, newest first; excludes soft-deleted). */
export interface TimeLogListResponse {
  data: TimeLog[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/** GET /time/rollup envelope. */
export interface ItemRollupResponse {
  data: ItemRollup[];
}

/** GET /time/summary envelope. */
export interface TimeSummaryResponse {
  data: TimeSummaryRow[];
}
