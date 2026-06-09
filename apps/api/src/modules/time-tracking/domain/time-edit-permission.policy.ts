/**
 * Who may edit or delete a time entry (FR-TT-003, SC-006 — research D9, time-tracking-flow.md §5).
 *
 * Pure, **default-deny**: an actor may edit/delete an entry iff they OWN it (`actor === log.userId`)
 * OR they are an org admin. Everyone else is denied — the provider raises `403` and nothing changes;
 * client role-gating is only cosmetic. Kept pure so owner-allow / admin-allow / other-deny are
 * exhaustively unit-testable without a DB or request context.
 */

/** The bit of the entry the decision needs (its owner; null once the user was removed). */
export interface EditableTimeLog {
  userId: string | null;
}

/** The acting principal: their id + whether they hold an org-admin role (OWNER/ADMIN). */
export interface EditActor {
  userId: string;
  isOrgAdmin: boolean;
}

/** True iff `actor` may edit/delete `log` (owner-or-admin). Default-deny on everything else. */
export function canEditTimeLog(log: EditableTimeLog, actor: EditActor): boolean {
  if (actor.isOrgAdmin) return true;
  return log.userId !== null && log.userId === actor.userId;
}
