'use client';

import type {
  ActiveTimer,
  ActiveTimerResponse,
  CreateTimeLogInput,
  InterruptionLedger,
  InterruptionLedgerResponse,
  ItemRollup,
  ItemRollupResponse,
  ReportOverview,
  ReportOverviewResponse,
  TimeLog,
  TimeLogEnvelope,
  TimeLogListResponse,
  TimeSummaryQuery,
  TimeSummaryResponse,
  TimeSummaryRow,
  UpdateTimeLogInput,
  WeeklySummary,
  WeeklySummaryResponse,
} from '@rytask/contracts';
import { authedRequest } from './http';

/** The active range + scope of a report request (US1/US2). Presets resolve to explicit `from`/`to`. */
export interface ReportRange {
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
}
export interface ReportScope {
  projectId?: string; // a single readable project, or all readable projects when omitted
  userId?: string; // a single person, or everyone when omitted
}

/**
 * Time-tracking resource module (M2, the flagship — web-surfaces.md §6). Typed wrappers over the
 * REST surface following the `lib/api/work-items.ts` pattern (`authedRequest`, cursor walks). The
 * server is authoritative: a running timer's truth is its server `startedAt` (the UI derives live
 * elapsed), `source` is set server-side, and edit/delete are owner-or-admin default-deny — these
 * helpers carry no client-side authority. Durations are integer **seconds**.
 */

// ──────────────────────────────────────────────────────────────────── timer

/** POST /work-items/{id}/timer/start — start (or switch) the caller's single timer. */
export async function startTimer(workItemId: string, note?: string): Promise<ActiveTimer> {
  const body = await authedRequest<TimeLogEnvelope | ActiveTimerResponse>(
    `/work-items/${workItemId}/timer/start`,
    { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
  );
  return body.data as ActiveTimer;
}

/** POST /timers/{id}/stop — stop the running timer; returns the finalized entry (source = Timer). */
export async function stopTimer(timerId: string): Promise<TimeLog> {
  const body = await authedRequest<TimeLogEnvelope>(`/timers/${timerId}/stop`, { method: 'POST' });
  return body.data;
}

/** GET /timers/active — the caller's active timer (zero or one), to re-sync after reload/restart. */
export async function getActiveTimer(): Promise<ActiveTimer | null> {
  const body = await authedRequest<ActiveTimerResponse>('/timers/active');
  return body.data;
}

// ───────────────────────────────────────────────────────────────── entries

/** GET /work-items/{id}/time-logs — every entry for an item (walks keyset pages), newest first. */
export async function listTimeLogs(workItemId: string): Promise<TimeLog[]> {
  const all: TimeLog[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<TimeLogListResponse>(
      `/work-items/${workItemId}/time-logs?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** POST /work-items/{id}/time-logs — a manual entry (duration OR start/end). `source` forced MANUAL. */
export async function createTimeLog(
  workItemId: string,
  input: CreateTimeLogInput,
): Promise<TimeLog> {
  const body = await authedRequest<TimeLogEnvelope>(`/work-items/${workItemId}/time-logs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** PATCH /time-logs/{id} — owner-or-admin edit (server default-deny on a non-owner non-admin). */
export async function updateTimeLog(id: string, input: UpdateTimeLogInput): Promise<TimeLog> {
  const body = await authedRequest<TimeLogEnvelope>(`/time-logs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /time-logs/{id} — owner-or-admin soft-delete (recoverable). */
export function deleteTimeLog(id: string): Promise<void> {
  return authedRequest<void>(`/time-logs/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────── aggregation

/** GET /time/rollup?projectId= — per-item logged totals for the in-row meter (merged client-side). */
export async function getProjectRollup(projectId: string): Promise<ItemRollup[]> {
  const params = new URLSearchParams({ projectId });
  const body = await authedRequest<ItemRollupResponse>(`/time/rollup?${params.toString()}`);
  return body.data;
}

/** GET /time/summary — totals grouped by the requested axis; `userId = me` ⇒ the "my time" view. */
export async function getTimeSummary(query: TimeSummaryQuery): Promise<TimeSummaryRow[]> {
  const params = new URLSearchParams({ groupBy: query.groupBy });
  if (query.period) params.set('period', query.period);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.projectId) params.set('projectId', query.projectId);
  if (query.userId) params.set('userId', query.userId);
  const body = await authedRequest<TimeSummaryResponse>(`/time/summary?${params.toString()}`);
  return body.data;
}

// ──────────────────────────────────────────────────────────────────── M4 reporting

/** Append the active range + scope to a query string (the three report routes share these params). */
function rangeParams(range: ReportRange, scope: ReportScope): URLSearchParams {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (scope.projectId) params.set('projectId', scope.projectId);
  if (scope.userId) params.set('userId', scope.userId);
  return params;
}

/** GET /time/reports/overview — the flagship "Where did my time go?" read-model (US1). */
export async function fetchReportOverview(
  range: ReportRange,
  scope: ReportScope = {},
): Promise<ReportOverview> {
  const body = await authedRequest<ReportOverviewResponse>(
    `/time/reports/overview?${rangeParams(range, scope).toString()}`,
  );
  return body.data;
}

/** GET /time/reports/interruptions — the interruption ledger: the evidence behind the headline (US2). */
export async function fetchInterruptionLedger(
  range: ReportRange,
  scope: ReportScope = {},
): Promise<InterruptionLedger> {
  const body = await authedRequest<InterruptionLedgerResponse>(
    `/time/reports/interruptions?${rangeParams(range, scope).toString()}`,
  );
  return body.data;
}

/** GET /time/reports/week — one user's Mon–Sun week ("My week", US3). `weekStart` must be a Monday. */
export async function fetchWeeklySummary(
  weekStart: string,
  userId?: string,
): Promise<WeeklySummary> {
  const params = new URLSearchParams({ weekStart });
  if (userId) params.set('userId', userId);
  const body = await authedRequest<WeeklySummaryResponse>(
    `/time/reports/week?${params.toString()}`,
  );
  return body.data;
}
