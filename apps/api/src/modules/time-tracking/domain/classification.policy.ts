import type { Priority, TimeEntryClass } from '@rytask/contracts';

/**
 * Planned-vs-interruption classification (FR-TT-006, SC-005 — research D6, time-tracking-flow.md §4).
 *
 * Pure: given the item's priority at entry-creation time and an optional explicit override, it decides
 * the entry's class. It NEVER touches the DB — the write providers (`create-time-log`, `stop-timer`,
 * the `start-timer` switch-finalize) call `resolveClassification` and snapshot the result onto
 * `time_logs.classification`, so a later change to the item's priority does NOT retroactively re-split
 * history. Keeping the decision pure makes Urgent⇒interruption / normal⇒planned / override-precedence
 * exhaustively unit-testable.
 *
 * Two values only (`PLANNED` | `INTERRUPTION`) so for any item/user/project/period
 * `plannedSeconds + interruptionSeconds === loggedSeconds` (the reconciliation invariant, US7).
 */

/** The signal the default derivation reads. Priority is the deterministic baseline (research D6). */
export interface ClassificationInput {
  /** The item's priority at the moment the entry is created (snapshotted, never re-read). */
  priority: Priority;
}

/** The resolved class plus whether it came from an explicit override (drives `classificationOverridden`). */
export interface ResolvedClassification {
  classification: TimeEntryClass;
  classificationOverridden: boolean;
}

/**
 * The default class for an item with no explicit override: `URGENT` work is an interruption, everything
 * else is planned. (Where a later milestone adds an interruption-bearing label it can flip this default;
 * priority is the deterministic baseline this milestone ships — research D6.)
 */
export function deriveClassification(input: ClassificationInput): TimeEntryClass {
  return input.priority === 'URGENT' ? 'INTERRUPTION' : 'PLANNED';
}

/**
 * Resolve the class to snapshot on a new/edited entry. An explicit `classification` always wins and
 * marks the entry overridden (the override sticks through later edits unless changed again — D6);
 * otherwise the default is derived from the item and the entry is not overridden.
 */
export function resolveClassification(
  explicit: TimeEntryClass | null | undefined,
  input: ClassificationInput,
): ResolvedClassification {
  if (explicit) {
    return { classification: explicit, classificationOverridden: true };
  }
  return { classification: deriveClassification(input), classificationOverridden: false };
}
