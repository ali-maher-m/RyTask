import type { Role } from '@rytask/contracts';

/**
 * Org-administration invariants (research D13, FR-RBAC-003, SC-015). Pure (no I/O) →
 * unit-tested at high coverage. Two rules protect the org: it must always retain at least one
 * active `OWNER`, and an `ADMIN` may not modify an `OWNER` (only an Owner can act on Owners).
 */

/**
 * Would removing or demoting this member leave the org with zero active Owners? Only an action
 * on a current `OWNER` can — and only when they are the last active one.
 */
export function wouldRemoveLastOwner(params: {
  targetCurrentRole: Role;
  activeOwnerCount: number;
  isRemoval: boolean;
  newRole?: Role;
}): boolean {
  if (params.targetCurrentRole !== 'OWNER') {
    return false;
  }
  if (params.isRemoval) {
    return params.activeOwnerCount <= 1;
  }
  // A role change that demotes the owner to a non-owner role.
  if (params.newRole !== undefined && params.newRole !== 'OWNER') {
    return params.activeOwnerCount <= 1;
  }
  return false;
}

/** An `ADMIN` may not change/remove an `OWNER` (rbac-matrix note ²); only an Owner can. */
export const adminCannotActOnOwner = (actorRole: Role, targetRole: Role): boolean =>
  actorRole === 'ADMIN' && targetRole === 'OWNER';

/**
 * Privilege rank for the role-assignment ceiling (FR-RBAC-003). Higher = more privileged. Used
 * only to compare an actor's role against a role they are trying to grant; it is NOT a general
 * authorization mechanism (permissions live in `common/rbac`).
 */
const ROLE_RANK: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  MEMBER: 3,
  VIEWER: 2,
  GUEST: 1,
};

/**
 * May `actorRole` grant (via invite or role-change) `targetRole`? Only when the target role is no
 * more privileged than the actor's own — so an `ADMIN` can assign up to `ADMIN` but never
 * `OWNER`, and only an `OWNER` may confer `OWNER`. This closes the privilege-escalation gap where
 * an Admin (holding `members:write`/`members:invite`) could otherwise mint Owners (FR-RBAC-003).
 */
export const canAssignRole = (actorRole: Role, targetRole: Role): boolean =>
  ROLE_RANK[targetRole] <= ROLE_RANK[actorRole];
