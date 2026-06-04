import { type Capability, can, reason } from '@/lib/auth/capabilities';
import type { Role } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';

/**
 * Client capability-map unit test (US5, T053, role-capability-matrix §"Rules the map MUST encode").
 * The map is cosmetic — the server's default-deny RbacGuard is authoritative — but it must mirror
 * the RBAC matrix exactly so controls are never wrongly offered. These assertions lock the seven
 * rules: default-deny parity, VIEWER read-only, org-admin bypass, owner-only transfer/delete,
 * admin-vs-owner, the last-owner guard, and that every reason is plain-language and kind.
 */

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];

describe('capability map — rule 1: default-deny parity', () => {
  it('reads are allowed for every role', () => {
    for (const role of ROLES) {
      expect(can(role, 'org:read')).toBe(true);
    }
  });

  it('GUEST cannot see the members surface; every other role can', () => {
    expect(can('GUEST', 'members:read')).toBe(false);
    for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as Role[]) {
      expect(can(role, 'members:read')).toBe(true);
    }
  });
});

describe('capability map — rule 2: VIEWER is read-only', () => {
  const mutating: Capability[] = [
    'workitem:write',
    'project:create',
    'project:admin',
    'org:settings:write',
    'members:invite',
    'members:write',
    'org:transfer',
    'org:delete',
  ];

  it('refuses every mutating capability regardless of project role', () => {
    for (const cap of mutating) {
      expect(can('VIEWER', cap, { projectRole: 'ADMIN' })).toBe(false);
    }
  });

  it('GUEST cannot write work items or create projects', () => {
    expect(can('GUEST', 'workitem:write', { projectRole: 'ADMIN' })).toBe(false);
    expect(can('GUEST', 'project:create')).toBe(false);
  });
});

describe('capability map — rule 3: org-admin bypass of project role', () => {
  it('OWNER/ADMIN satisfy project-scoped writes without a project role', () => {
    for (const role of ['OWNER', 'ADMIN'] as Role[]) {
      expect(can(role, 'workitem:write')).toBe(true);
      expect(can(role, 'project:admin')).toBe(true);
    }
  });

  it('MEMBER writes defer to the project role', () => {
    expect(can('MEMBER', 'workitem:write')).toBe(false);
    expect(can('MEMBER', 'workitem:write', { projectRole: 'VIEWER' })).toBe(false);
    expect(can('MEMBER', 'workitem:write', { projectRole: 'MEMBER' })).toBe(true);
    expect(can('MEMBER', 'workitem:write', { projectRole: 'ADMIN' })).toBe(true);

    // Project settings need project ADMIN (not just MEMBER).
    expect(can('MEMBER', 'project:admin', { projectRole: 'MEMBER' })).toBe(false);
    expect(can('MEMBER', 'project:admin', { projectRole: 'ADMIN' })).toBe(true);
  });
});

describe('capability map — rule 4: owner-only transfer/delete', () => {
  it('only OWNER can transfer ownership or delete the org', () => {
    expect(can('OWNER', 'org:transfer')).toBe(true);
    expect(can('OWNER', 'org:delete')).toBe(true);
    for (const role of ['ADMIN', 'MEMBER', 'GUEST', 'VIEWER'] as Role[]) {
      expect(can(role, 'org:transfer')).toBe(false);
      expect(can(role, 'org:delete')).toBe(false);
    }
  });
});

describe('capability map — rule 5: admin-vs-owner', () => {
  it('an ADMIN cannot change or remove an OWNER', () => {
    expect(can('ADMIN', 'members:write', { targetRole: 'OWNER' })).toBe(false);
    expect(can('ADMIN', 'members:write', { targetRole: 'ADMIN' })).toBe(true);
    expect(can('ADMIN', 'members:write', { targetRole: 'MEMBER' })).toBe(true);
  });

  it('an OWNER can act on anyone (subject to the last-owner guard)', () => {
    expect(can('OWNER', 'members:write', { targetRole: 'OWNER' })).toBe(true);
  });
});

describe('capability map — rule 6: last-owner guard', () => {
  it('no actor can demote or remove the only OWNER', () => {
    expect(can('OWNER', 'members:write', { targetRole: 'OWNER', isLastOwner: true })).toBe(false);
    expect(can('ADMIN', 'members:write', { targetRole: 'OWNER', isLastOwner: true })).toBe(false);
  });
});

describe('capability map — reasons are plain-language', () => {
  it('every disabled capability has a kind, non-empty reason', () => {
    const gated: Capability[] = [
      'members:read',
      'workitem:write',
      'project:create',
      'project:admin',
      'org:settings:write',
      'members:invite',
      'members:write',
      'org:transfer',
      'org:delete',
    ];
    for (const cap of gated) {
      const text = reason(cap);
      expect(text.length).toBeGreaterThan(0);
      // Plain copy: a full sentence, no error codes or jargon.
      expect(text).not.toMatch(/403|RBAC|forbidden|unauthor/i);
      expect(text).toMatch(/[.]$/);
    }
  });
});
