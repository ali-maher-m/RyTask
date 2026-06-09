/**
 * One-active-timer-per-user decision (FR-TT-001, SC-002 — research D3, time-tracking-flow.md §1).
 *
 * Pure: given the caller's CURRENT running timer (or null) and the item they want to start on, it
 * decides whether to start fresh, switch (finalize the running one then start the new), or no-op
 * (already running on this exact item). It NEVER touches the DB — the provider executes the chosen
 * shape inside one transaction; the `UNIQUE(organization_id, user_id)` index is the real concurrency
 * guard (a racing second start surfaces as a unique violation the provider resolves to the running
 * timer). Keeping the decision pure makes switch-vs-start exhaustively unit-testable.
 */

/** The caller's running timer, as the policy needs to see it (a slice of the `timers` row). */
export interface RunningTimer {
  id: string;
  workItemId: string;
  startedAt: Date;
}

/** What to finalize when switching away from a running timer (the prior accrual → a `time_log`). */
export interface FinalizeShape {
  timerId: string;
  workItemId: string;
  startedAt: Date;
  /** `round(now − startedAt)` in whole seconds, floored to 1 (a stop never records a zero entry). */
  durationSeconds: number;
}

export type StartDecision =
  /** Already running on the SAME item → return the running timer unchanged (no new entry). */
  | { kind: 'noop' }
  /** Idle → just insert the new running timer. */
  | { kind: 'start' }
  /** Running on ANOTHER item → finalize that one into a `time_log`, delete it, then start the new. */
  | { kind: 'switch'; finalize: FinalizeShape };

/** Whole-seconds elapsed between two instants, never below 1 (a finalized entry is always `> 0`). */
export function elapsedSeconds(startedAt: Date, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 1000));
}

/**
 * Decide how a `start` on `targetWorkItemId` resolves given the caller's current timer.
 * `now` comes from the server `CLOCK` (research D4) so the finalize duration is deterministic.
 */
export function decideStart(
  current: RunningTimer | null,
  targetWorkItemId: string,
  now: Date,
): StartDecision {
  if (!current) return { kind: 'start' };
  if (current.workItemId === targetWorkItemId) return { kind: 'noop' };
  return {
    kind: 'switch',
    finalize: {
      timerId: current.id,
      workItemId: current.workItemId,
      startedAt: current.startedAt,
      durationSeconds: elapsedSeconds(current.startedAt, now),
    },
  };
}
