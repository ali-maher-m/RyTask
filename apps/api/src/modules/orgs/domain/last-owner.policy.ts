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
