import { describe, expect, it } from 'vitest';
import { adminCannotActOnOwner, canAssignRole, wouldRemoveLastOwner } from './last-owner.policy';

/**
 * Unit tests for the last-owner + admin-vs-owner invariants (T101, US8, SC-015, FR-RBAC-003).
 */
describe('last-owner.policy', () => {
  describe('wouldRemoveLastOwner', () => {
    it('blocks removing the only Owner', () => {
      expect(
        wouldRemoveLastOwner({ targetCurrentRole: 'OWNER', activeOwnerCount: 1, isRemoval: true }),
      ).toBe(true);
    });

    it('allows removing an Owner when another remains', () => {
      expect(
        wouldRemoveLastOwner({ targetCurrentRole: 'OWNER', activeOwnerCount: 2, isRemoval: true }),
      ).toBe(false);
    });

    it('blocks demoting the only Owner', () => {
      expect(
        wouldRemoveLastOwner({
          targetCurrentRole: 'OWNER',
          activeOwnerCount: 1,
          isRemoval: false,
          newRole: 'ADMIN',
        }),
      ).toBe(true);
    });

    it('allows "demoting" the only Owner to OWNER (no-op keeps an owner)', () => {
      expect(
        wouldRemoveLastOwner({
          targetCurrentRole: 'OWNER',
          activeOwnerCount: 1,
          isRemoval: false,
          newRole: 'OWNER',
        }),
      ).toBe(false);
    });

    it('never blocks actions on non-Owners', () => {
      expect(
        wouldRemoveLastOwner({ targetCurrentRole: 'MEMBER', activeOwnerCount: 1, isRemoval: true }),
      ).toBe(false);
      expect(
        wouldRemoveLastOwner({
          targetCurrentRole: 'ADMIN',
          activeOwnerCount: 1,
          isRemoval: false,
          newRole: 'VIEWER',
        }),
      ).toBe(false);
    });
  });

  describe('adminCannotActOnOwner', () => {
    it('forbids an ADMIN acting on an OWNER', () => {
      expect(adminCannotActOnOwner('ADMIN', 'OWNER')).toBe(true);
    });

    it('allows an OWNER to act on an OWNER, and an ADMIN on non-owners', () => {
      expect(adminCannotActOnOwner('OWNER', 'OWNER')).toBe(false);
      expect(adminCannotActOnOwner('ADMIN', 'MEMBER')).toBe(false);
      expect(adminCannotActOnOwner('ADMIN', 'ADMIN')).toBe(false);
    });
  });

  describe('canAssignRole (role-assignment ceiling, FR-RBAC-003)', () => {
    it('forbids an ADMIN granting OWNER (the escalation gap)', () => {
      expect(canAssignRole('ADMIN', 'OWNER')).toBe(false);
    });

    it('only an OWNER may confer OWNER', () => {
      expect(canAssignRole('OWNER', 'OWNER')).toBe(true);
      expect(canAssignRole('MEMBER', 'OWNER')).toBe(false);
      expect(canAssignRole('VIEWER', 'OWNER')).toBe(false);
    });

    it('lets an actor assign roles at or below their own rank', () => {
      expect(canAssignRole('ADMIN', 'ADMIN')).toBe(true);
      expect(canAssignRole('ADMIN', 'MEMBER')).toBe(true);
      expect(canAssignRole('ADMIN', 'VIEWER')).toBe(true);
      expect(canAssignRole('ADMIN', 'GUEST')).toBe(true);
      expect(canAssignRole('OWNER', 'ADMIN')).toBe(true);
    });

    it('forbids granting a role above the actor (e.g. MEMBER → ADMIN)', () => {
      expect(canAssignRole('MEMBER', 'ADMIN')).toBe(false);
      expect(canAssignRole('VIEWER', 'MEMBER')).toBe(false);
    });
  });
});
