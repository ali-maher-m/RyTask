import { describe, expect, it } from 'vitest';
import { canEditTimeLog } from './time-edit-permission.policy';

/**
 * Unit test for the edit/delete permission policy (T050, time-tracking-flow.md §5). Owner-allow,
 * admin-allow, other-deny, and the default-deny edges (a null-owner entry only an admin may touch).
 */
const OWNER = 'user-owner';
const OTHER = 'user-other';

describe('canEditTimeLog (owner-or-admin, default-deny)', () => {
  it('allows the owner to edit their own entry', () => {
    expect(canEditTimeLog({ userId: OWNER }, { userId: OWNER, isOrgAdmin: false })).toBe(true);
  });

  it('allows an org admin to correct another user’s entry', () => {
    expect(canEditTimeLog({ userId: OWNER }, { userId: OTHER, isOrgAdmin: true })).toBe(true);
  });

  it('denies a non-owner non-admin', () => {
    expect(canEditTimeLog({ userId: OWNER }, { userId: OTHER, isOrgAdmin: false })).toBe(false);
  });

  it('denies a non-admin on an orphaned (null-owner) entry, but allows an admin', () => {
    expect(canEditTimeLog({ userId: null }, { userId: OTHER, isOrgAdmin: false })).toBe(false);
    expect(canEditTimeLog({ userId: null }, { userId: OTHER, isOrgAdmin: true })).toBe(true);
  });
});
