/**
 * Overdue policy (pure domain, FR-DATE-003). The SINGLE source of the "is this item
 * overdue?" rule, shared by the list/board read path (the in-memory DTO flag) and kept in
 * lockstep with the SQL the shared query engine compiles for the `overdue` field /
 * Overdue smart view. No I/O — callers pass the relevant row fields + the org-tz "today".
 *
 *   overdue ⇔ dueDate != null
 *           AND dueDate < today (org timezone, YYYY-MM-DD)
 *           AND the item is not in a closed (COMPLETED / CANCELLED) status category.
 *
 * Boundary: an item due "today" is NOT overdue (strict `<`). Overdue clears the moment the
 * item enters a closed category (completed/cancelled), regardless of the date.
 */

import { CLOSED_CATEGORIES } from '../../views/views.contract';

export interface OverdueInput {
  /** The item's due date as YYYY-MM-DD, or null when none is set. */
  dueDate: string | null;
  /** Org-tz "today" as YYYY-MM-DD (Clock-derived). */
  today: string;
  /** The item's status category (BACKLOG/UNSTARTED/STARTED/COMPLETED/CANCELLED). */
  statusCategory?: string | null;
  /** When `statusCategory` is unavailable, `completedAt != null` also means "closed". */
  completedAt?: Date | string | null;
}

/** True iff a status category means the work is closed (COMPLETED / CANCELLED). */
export function isClosedCategory(category: string | null | undefined): boolean {
  return category != null && (CLOSED_CATEGORIES as readonly string[]).includes(category);
}

/** Compute the overdue state for a single item (FR-DATE-003). Pure — no DB, no clock. */
export function isOverdue(input: OverdueInput): boolean {
  if (input.dueDate == null) return false;
  // Strict `<`: due today is not yet overdue.
  if (!(input.dueDate < input.today)) return false;
  // Closed work is never overdue. Prefer the category; fall back to completed_at when the
  // category is not carried (e.g. the flat list row has only completed_at).
  if (input.statusCategory !== undefined) {
    if (isClosedCategory(input.statusCategory)) return false;
  } else if (input.completedAt != null) {
    return false;
  }
  return true;
}
