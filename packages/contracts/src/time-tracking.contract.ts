import { z } from 'zod';
import type { CaptureSource } from './work-items.contract';

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

// ─────────────────────────────────────────────────────────── M4 reporting read-models
//
// Three computed read-models (data-model §2) returned by the three new GET routes on
// `time-reports.controller.ts`. ALL durations are integer **seconds** (the M2 convention); all dates
// are `YYYY-MM-DD`; weeks are keyed by their ISO Monday (UTC `date_trunc`, research D5). Every figure
// reconciles: `plannedSeconds + interruptionSeconds === loggedSeconds` at every level (binary
// classification, SC-002) and the ledger total === the headline interruption figure (SC-003). These
// are pure reads — no MCP tool (FR-RPT-009 is v2; registry stays 49/49). The cross-field range rules
// (`from <= to`, span ≤ 366d, `weekStart` is a Monday) live in `report-range.policy` server-side, NOT
// in a Zod `.refine` (TS2589 — the same reason the duration rules stay out of the schemas above).

/** Whole-range / per-week sums. `plannedSeconds + interruptionSeconds === loggedSeconds` (SC-002). */
export interface ReportTotals {
  loggedSeconds: number;
  plannedSeconds: number;
  interruptionSeconds: number;
}

/** One ISO week's sums, keyed by its Monday (`YYYY-MM-DD`). */
export interface ReportWeekRow extends ReportTotals {
  weekStart: string;
}

/** One of the top time-sink items (by logged seconds, descending). `projectId` builds the detail link. */
export interface ReportTopItem {
  workItemId: string;
  projectId: string;
  key: string;
  title: string;
  loggedSeconds: number;
}

/** US1 — `GET /time/reports/overview`: the flagship "Where did my time go?" read-model (§2.1). */
export interface ReportOverview {
  range: { from: string; to: string }; // echo of the inclusive request range
  totals: ReportTotals; // whole-range sums
  weeks: ReportWeekRow[]; // ISO weeks intersecting the range, ascending (zero rows included)
  topItems: ReportTopItem[]; // top 10 items by loggedSeconds, descending (key tiebreak)
}

/** One interruption-ledger row — one item that ate interruption time in the range (§2.2). */
export interface LedgerItem {
  workItemId: string;
  projectId: string; // builds the item-detail link
  key: string;
  title: string;
  captureSource: CaptureSource; // work_items.source (M3) — where it came from, NOT the entry source
  reporter: { id: string; name: string } | null; // who raised it; null when the user was removed
  entryCount: number;
  seconds: number; // interruption-classified seconds in range
}

/** One ISO week of interruption evidence. */
export interface LedgerWeekRow {
  weekStart: string;
  seconds: number;
  itemCount: number;
}

/** US2 — `GET /time/reports/interruptions`: the evidence layer behind the headline (§2.2). */
export interface InterruptionLedger {
  range: { from: string; to: string };
  totalSeconds: number; // === overview.totals.interruptionSeconds (SC-003)
  itemCount: number; // distinct items with interruption time in range
  entryCount: number; // contributing non-deleted entries
  items: LedgerItem[]; // one row per item, seconds descending (key tiebreak)
  weeks: LedgerWeekRow[]; // per-ISO-week interruption evidence, ascending
}

/** One row in "What I tracked" — an item the subject logged time on this week (§2.3). */
export interface WeeklyItemRow {
  workItemId: string;
  projectId: string; // builds the item-detail link
  key: string;
  title: string;
  loggedSeconds: number;
  estimateValue: string | null; // M1 numeric-as-string, interpreted as hours (the M2 meter rule)
  completed: boolean; // completed_at within the week
}

/** One row in "Completed this week" — assigned-to-subject, completed_at within the week (§2.3). */
export interface CompletedItemRow {
  workItemId: string;
  projectId: string; // builds the item-detail link
  key: string;
  title: string;
  completedAt: string; // ISO timestamp
}

/** US3 — `GET /time/reports/week`: one user, one Mon–Sun week, the personal summary (§2.3). */
export interface WeeklySummary {
  weekStart: string; // Monday (inclusive)
  weekEnd: string; // Sunday (inclusive)
  userId: string; // the subject (defaults to the principal)
  totals: ReportTotals;
  items: WeeklyItemRow[]; // items the user tracked time on, seconds descending
  completedItems: CompletedItemRow[]; // assigned-to-user, completed_at within the week
}

/**
 * GET /time/reports/{overview,interruptions} query params (US1/US2). `from`/`to` are required
 * inclusive `YYYY-MM-DD` calendar days; `projectId` (assert VIEWER) / `userId` are optional filters.
 * Unknown fields rejected (`.strict`); the inclusive-order + max-span rules are enforced in
 * `report-range.policy` (TS2589 — see header).
 */
export const reportRangeQuerySchema = z
  .object({
    from: dateString,
    to: dateString,
    projectId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
  })
  .strict();
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

/**
 * GET /time/reports/week query params (US3). `weekStart` is a required `YYYY-MM-DD` that MUST be a
 * Monday (validated in `report-range.policy` → 400); `userId` defaults to the principal ("my week").
 * Unknown fields rejected (`.strict`).
 */
export const reportWeekQuerySchema = z
  .object({
    weekStart: dateString,
    userId: z.string().uuid().optional(),
  })
  .strict();
export type ReportWeekQuery = z.infer<typeof reportWeekQuerySchema>;

/** GET /time/reports/overview envelope. */
export interface ReportOverviewResponse {
  data: ReportOverview;
}

/** GET /time/reports/interruptions envelope. */
export interface InterruptionLedgerResponse {
  data: InterruptionLedger;
}

/** GET /time/reports/week envelope. */
export interface WeeklySummaryResponse {
  data: WeeklySummary;
}
