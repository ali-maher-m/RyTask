/**
 * Manual time-entry duration validation (FR-TT-002/FR-TT-004 — research D5, time-tracking-flow.md §3).
 *
 * Pure: normalizes the two accepted manual forms to ONE stored shape (`startedAt`/`endedAt`/
 * `durationSeconds`) so a manual entry sums identically to a timer entry (SC-004), and rejects the
 * invalid forms with a friendly message — nothing is persisted on reject (the provider maps a reject
 * to `400`). No DB, no tenancy, no `new Date()` of its own: the caller passes `now` from the `CLOCK`
 * port so the default day is deterministic under test.
 *
 * Accepted: EITHER `durationSeconds` (a duration-only entry, dated by `date`/anchor) XOR a
 * `startedAt`+`endedAt` pair. Rejected: both forms at once, neither, a non-positive or absurd span
 * (> {@link MAX_ENTRY_SECONDS}), or `endedAt ≤ startedAt`.
 */

/** Reject a single manual entry longer than this — 24h; a longer span is a typo (log it in chunks). */
export const MAX_ENTRY_SECONDS = 24 * 60 * 60;

/** The raw manual-entry form (one of the two accepted shapes). */
export interface DurationFormInput {
  durationSeconds?: number;
  startedAt?: string; // ISO
  endedAt?: string; // ISO
  date?: string; // YYYY-MM-DD — the day of a duration-only entry (defaults to `now`)
}

/** The single stored shape every entry is normalized to. */
export interface ResolvedEntry {
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

/** Either the normalized entry, or a friendly reason the form is invalid (mapped to `400`). */
export type DurationResult = { ok: true; entry: ResolvedEntry } | { ok: false; message: string };

/** `YYYY-MM-DD` (UTC) for an instant — the default day of a duration-only entry. */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a manual entry's stored shape, or a friendly reject. `now` (the server `CLOCK`) supplies the
 * default day for a duration-only entry; `anchorStartedAt`, when given (an edit that keeps the original
 * start), pins a duration-only entry's `startedAt` instead of the date's midnight.
 */
export function resolveEntry(
  input: DurationFormInput,
  now: Date,
  anchorStartedAt?: Date,
): DurationResult {
  const hasDuration = input.durationSeconds !== undefined;
  const hasStart = input.startedAt !== undefined;
  const hasEnd = input.endedAt !== undefined;

  // Exclusive-or: a duration and a start/end pair are mutually exclusive (research D5).
  if (hasDuration && (hasStart || hasEnd)) {
    return { ok: false, message: 'Enter either a duration or a start and end time, not both.' };
  }

  // ── start/end form ──
  if (!hasDuration) {
    if (!hasStart || !hasEnd) {
      return { ok: false, message: 'Enter either a duration, or both a start and end time.' };
    }
    const startedAt = new Date(input.startedAt as string);
    const endedAt = new Date(input.endedAt as string);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      return { ok: false, message: 'The start and end times must be valid.' };
    }
    const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
    if (durationSeconds <= 0) {
      return { ok: false, message: 'The end time must be after the start time.' };
    }
    if (durationSeconds > MAX_ENTRY_SECONDS) {
      return { ok: false, message: 'That entry is longer than a day — log it in smaller chunks.' };
    }
    return { ok: true, entry: { startedAt, endedAt, durationSeconds } };
  }

  // ── duration-only form ──
  const durationSeconds = input.durationSeconds as number;
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, message: 'Enter a duration greater than zero.' };
  }
  if (durationSeconds > MAX_ENTRY_SECONDS) {
    return { ok: false, message: 'That entry is longer than a day — log it in smaller chunks.' };
  }
  const startedAt = anchorStartedAt ?? new Date(`${input.date ?? toDateString(now)}T00:00:00.000Z`);
  if (Number.isNaN(startedAt.getTime())) {
    return { ok: false, message: 'The date is not valid.' };
  }
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  return { ok: true, entry: { startedAt, endedAt, durationSeconds } };
}
