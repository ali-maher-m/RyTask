/**
 * Status workflow policy (pure domain, FR-WF-002, ADR-004). No I/O — the provider feeds
 * it the current status set + counts and acts on the decision. Three rules:
 *   1. A project must always retain ≥1 status (never delete the last one).
 *   2. Deleting a status that still has items requires a `reassignTo` target (items are
 *      re-mapped in one transaction; never orphaned).
 *   3. The fixed category set is closed; a status maps to exactly one category, and a
 *      COMPLETED/CANCELLED category means "closed" (drives completed_at + overdue).
 */

export const STATUS_CATEGORIES = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

/** Categories that mean the work is no longer open (FR-DATE-003 / completed_at rule). */
export const CLOSED_CATEGORIES: ReadonlyArray<StatusCategory> = ['COMPLETED', 'CANCELLED'];

/** True iff `category` is one of the fixed, known categories. */
export function isValidCategory(category: string): category is StatusCategory {
  return (STATUS_CATEGORIES as readonly string[]).includes(category);
}

/** A status is "completed" iff its category is COMPLETED (sets completed_at on entry). */
export function isCompletedCategory(category: string | null | undefined): boolean {
  return category === 'COMPLETED';
}

/** A status is "closed" (completed or cancelled) — excluded from overdue / open smart views. */
export function isClosedCategory(category: string | null | undefined): boolean {
  return category === 'COMPLETED' || category === 'CANCELLED';
}

/** Reason a delete is rejected — surfaced to the provider so it can map to the right HTTP error. */
export type DeleteRejection =
  | { ok: true }
  | { ok: false; reason: 'LAST_STATUS' }
  | { ok: false; reason: 'HAS_ITEMS_NEEDS_REASSIGN' }
  | { ok: false; reason: 'REASSIGN_SAME' }
  | { ok: false; reason: 'REASSIGN_UNKNOWN' };

export interface DeleteStatusContext {
  /** Total number of statuses currently in the project (including the one being deleted). */
  totalStatuses: number;
  /** How many work items currently reference the status being deleted. */
  itemCount: number;
  /** The id of the status being deleted. */
  statusId: string;
  /** The requested re-map target (query param), if any. */
  reassignTo?: string | null;
  /** The set of OTHER status ids in the project (valid re-map targets). */
  otherStatusIds: ReadonlyArray<string>;
}

/**
 * Decide whether a status delete is allowed (rule 1 + rule 2). The caller performs the
 * actual cascade re-map + delete in one transaction only when this returns `{ ok: true }`.
 */
export function evaluateStatusDelete(ctx: DeleteStatusContext): DeleteRejection {
  // Rule 1: never remove the project's last status.
  if (ctx.totalStatuses <= 1) {
    return { ok: false, reason: 'LAST_STATUS' };
  }

  // Rule 2: a status with items can only be removed if its items are re-mapped.
  if (ctx.itemCount > 0) {
    if (!ctx.reassignTo) {
      return { ok: false, reason: 'HAS_ITEMS_NEEDS_REASSIGN' };
    }
    if (ctx.reassignTo === ctx.statusId) {
      return { ok: false, reason: 'REASSIGN_SAME' };
    }
    if (!ctx.otherStatusIds.includes(ctx.reassignTo)) {
      return { ok: false, reason: 'REASSIGN_UNKNOWN' };
    }
  } else if (ctx.reassignTo) {
    // No items but a target was named: it must still be a real, different status.
    if (ctx.reassignTo === ctx.statusId) {
      return { ok: false, reason: 'REASSIGN_SAME' };
    }
    if (!ctx.otherStatusIds.includes(ctx.reassignTo)) {
      return { ok: false, reason: 'REASSIGN_UNKNOWN' };
    }
  }

  return { ok: true };
}
