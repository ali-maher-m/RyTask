import type { Role } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';
import { isOrgAdminRole, isOwnerOnly, permissionsForRole, roleSatisfies } from './role.policy';

/**
 * Unit tests for role → permission resolution (T070, US4, FR-RBAC-001/007). Asserts the
 * catalog matches every row of `rbac-matrix.md`: Viewer/Guest read-only, Owner-only actions,
 * the org-admin set, and default-deny. This is the contract the RbacGuard enforces on the
 * hot path, so it is pinned here independently of the guard.
 */
const ALL_ROLES: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];

describe('role.policy', () => {
  it('grants every role its own session/profile reads (self, org:read)', () => {
    for (const role of ALL_ROLES) {
      expect(roleSatisfies(role, 'self')).toBe(true);
      expect(roleSatisfies(role, 'org:read')).toBe(true);
      expect(roleSatisfies(role, 'tokens:write')).toBe(true);
    }
  });

  it('makes VIEWER read-only: work:read yes, work:write no (SC-006)', () => {
    expect(roleSatisfies('VIEWER', 'work:read')).toBe(true);
    expect(roleSatisfies('VIEWER', 'work:write')).toBe(false);
  });

  it('keeps GUEST read-only on work in M0 (least-privilege)', () => {
    expect(roleSatisfies('GUEST', 'work:read')).toBe(true);
    expect(roleSatisfies('GUEST', 'work:write')).toBe(false);
  });

  it('lets MEMBER+ mutate work', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER'] as Role[]) {
      expect(roleSatisfies(role, 'work:write')).toBe(true);
    }
  });

  it('restricts members:invite / members:write to OWNER+ADMIN', () => {
    expect(roleSatisfies('OWNER', 'members:invite')).toBe(true);
    expect(roleSatisfies('ADMIN', 'members:invite')).toBe(true);
    for (const role of ['MEMBER', 'GUEST', 'VIEWER'] as Role[]) {
      expect(roleSatisfies(role, 'members:invite')).toBe(false);
      expect(roleSatisfies(role, 'members:write')).toBe(false);
    }
  });

  it('restricts members:read to everyone except GUEST', () => {
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as Role[]) {
      expect(roleSatisfies(role, 'members:read')).toBe(true);
    }
    expect(roleSatisfies('GUEST', 'members:read')).toBe(false);
  });

  it('restricts org:settings:write to OWNER+ADMIN', () => {
    expect(roleSatisfies('OWNER', 'org:settings:write')).toBe(true);
    expect(roleSatisfies('ADMIN', 'org:settings:write')).toBe(true);
    expect(roleSatisfies('MEMBER', 'org:settings:write')).toBe(false);
  });

  it('makes org:delete / org:transfer Owner-only', () => {
    expect(isOwnerOnly('org:delete')).toBe(true);
    expect(isOwnerOnly('org:transfer')).toBe(true);
    expect(isOwnerOnly('members:invite')).toBe(false);
    expect(roleSatisfies('OWNER', 'org:delete')).toBe(true);
    expect(roleSatisfies('ADMIN', 'org:delete')).toBe(false);
    expect(roleSatisfies('OWNER', 'org:transfer')).toBe(true);
    expect(roleSatisfies('ADMIN', 'org:transfer')).toBe(false);
  });

  it('identifies OWNER/ADMIN as org-admins (project-check bypass)', () => {
    expect(isOrgAdminRole('OWNER')).toBe(true);
    expect(isOrgAdminRole('ADMIN')).toBe(true);
    for (const role of ['MEMBER', 'GUEST', 'VIEWER'] as Role[]) {
      expect(isOrgAdminRole(role)).toBe(false);
    }
  });

  it('exposes the full permission set per role (default-deny on unknowns)', () => {
    expect(permissionsForRole('OWNER').has('org:delete')).toBe(true);
    expect(permissionsForRole('VIEWER').has('work:write')).toBe(false);
    // @ts-expect-error — unknown permission is not in the catalog.
    expect(roleSatisfies('OWNER', 'bogus:permission')).toBe(false);
  });
});
