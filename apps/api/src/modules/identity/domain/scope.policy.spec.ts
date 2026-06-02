import { describe, expect, it } from 'vitest';
import { SCOPE_WILDCARD, scopeSatisfies } from './scope.policy';

/**
 * Unit tests for PAT scope ∩ role resolution (T091, US7, FR-RBAC-009, SC-012). Effective =
 * token scope ∩ holder's role: out-of-scope denied even when the role allows; beyond-role
 * denied even when the scope allows; empty/`*` scope = full role.
 */
describe('scope.policy', () => {
  it('allows an in-scope, in-role permission', () => {
    expect(scopeSatisfies('MEMBER', ['work:read'], 'work:read')).toBe(true);
  });

  it('denies an out-of-scope permission even though the role allows it (SC-012)', () => {
    expect(scopeSatisfies('MEMBER', ['work:read'], 'work:write')).toBe(false);
  });

  it('denies a beyond-role permission even though the scope lists it', () => {
    // VIEWER lacks work:write, so no scope can grant it.
    expect(scopeSatisfies('VIEWER', ['work:write'], 'work:write')).toBe(false);
    // MEMBER lacks members:invite — scope can't escalate.
    expect(scopeSatisfies('MEMBER', ['members:invite'], 'members:invite')).toBe(false);
  });

  it('treats an empty scope list as full delegation of the role', () => {
    expect(scopeSatisfies('MEMBER', [], 'work:write')).toBe(true);
    expect(scopeSatisfies('VIEWER', [], 'work:write')).toBe(false); // still bounded by role
  });

  it('treats the wildcard as full delegation of the role', () => {
    expect(scopeSatisfies('ADMIN', [SCOPE_WILDCARD], 'members:invite')).toBe(true);
    expect(scopeSatisfies('VIEWER', [SCOPE_WILDCARD], 'work:write')).toBe(false);
  });
});
