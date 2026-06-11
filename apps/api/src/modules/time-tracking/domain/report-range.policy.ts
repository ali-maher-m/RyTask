/**
 * Pure date helpers for the M4 reports (research D5, time-tracking-flow.md §8). Mirrors the M2
 * `summarize` date convention EXACTLY: `from`/`to` are inclusive `YYYY-MM-DD` calendar days bounded
 * in UTC; an entry belongs to the week of its `started_at`; weeks are `date_trunc('week', …)` in UTC
 * = ISO Monday–Sunday, keyed by their Monday. No DB, no tenancy, no `new Date()` of its own — every
 * input is an explicit calendar string, so results are deterministic under test. Validators return a
 * friendly reject (the provider maps `{ ok: false }` to a `400`), the same shape as `duration.policy`.
 */

/** The longest range a single report may span — a sanity bound (SC-005), inclusive of both ends. */
export const MAX_RANGE_DAYS = 366;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Either valid, or a friendly reason it is not (mapped to `400` by the caller). */
export type RangeResult = { ok: true } | { ok: false; message: string };

/** Parse a `YYYY-MM-DD` calendar day to its UTC midnight instant, or `null` if it is not a real day. */
function parseDay(day: string): Date | null {
  const d = new Date(`${day}T00:00:00.000Z`);
  // Reject NaN and overflow (e.g. `2026-02-30` rolls into March) by round-tripping the value.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) return null;
  return d;
}

/** `YYYY-MM-DD` (UTC) for an instant. */
function toDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole UTC days `n` after `day` (negative to go back), as `YYYY-MM-DD`. */
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  if (!d) throw new Error(`invalid day: ${day}`);
  return toDay(new Date(d.getTime() + n * MS_PER_DAY));
}

/** True iff `day` (a `YYYY-MM-DD`, UTC) is a Monday — ISO weeks start Monday. */
export function isMonday(day: string): boolean {
  const d = parseDay(day);
  return d != null && d.getUTCDay() === 1; // 0 = Sunday, 1 = Monday
}

/** The Monday that starts the ISO week containing `day` (UTC), as `YYYY-MM-DD` — `date_trunc('week')`. */
export function isoWeekStart(day: string): string {
  const d = parseDay(day);
  if (!d) throw new Error(`invalid day: ${day}`);
  // getUTCDay: 0=Sun..6=Sat. Days since Monday = (dow + 6) % 7 (Mon→0, …, Sun→6).
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return toDay(new Date(d.getTime() - daysSinceMonday * MS_PER_DAY));
}

/** The Sunday that ends the ISO week starting at `weekStart` (Monday + 6 days), as `YYYY-MM-DD`. */
export function weekEndOf(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Validate an inclusive `from`/`to` range: both real days, `from <= to`, span ≤ 366 days. */
export function validateRange(from: string, to: string): RangeResult {
  const f = parseDay(from);
  const t = parseDay(to);
  if (!f || !t) {
    return { ok: false, message: 'Pick valid start and end dates.' };
  }
  if (f.getTime() > t.getTime()) {
    return { ok: false, message: 'The start date must be on or before the end date.' };
  }
  const inclusiveDays = (t.getTime() - f.getTime()) / MS_PER_DAY + 1;
  if (inclusiveDays > MAX_RANGE_DAYS) {
    return { ok: false, message: 'Pick a range of a year or less.' };
  }
  return { ok: true };
}

/** Validate that `weekStart` is a real day AND a Monday (else a plain-language `400`). */
export function validateWeekStart(weekStart: string): RangeResult {
  if (!parseDay(weekStart)) {
    return { ok: false, message: 'Pick a valid week.' };
  }
  if (!isMonday(weekStart)) {
    return { ok: false, message: 'A week must start on a Monday.' };
  }
  return { ok: true };
}

/**
 * Every ISO-week Monday (`YYYY-MM-DD`) whose week intersects the inclusive `[from, to]` range, ascending
 * — including weeks with zero logged time, so the overview's "By week" table reads continuously
 * (data-model §2.1). Assumes the range already passed {@link validateRange}.
 */
export function weekStartsInRange(from: string, to: string): string[] {
  const first = isoWeekStart(from);
  const last = isoWeekStart(to);
  const weeks: string[] = [];
  let cursor = first;
  // Compare as instants so a month/year boundary is handled correctly.
  const lastMs = new Date(`${last}T00:00:00.000Z`).getTime();
  while (new Date(`${cursor}T00:00:00.000Z`).getTime() <= lastMs) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}
