import { describe, expect, it } from 'vitest';
import { evaluateRefresh } from './token.policy';

const now = new Date('2026-06-01T12:00:00.000Z');
const future = new Date('2026-07-01T12:00:00.000Z');
const past = new Date('2026-05-01T12:00:00.000Z');

describe('token.policy — evaluateRefresh', () => {
  it('rotates a valid active, unexpired token', () => {
    expect(evaluateRefresh({ revokedAt: null, expiresAt: future }, now)).toEqual({
      action: 'rotate',
    });
  });

  it('rejects an unknown token', () => {
    expect(evaluateRefresh(null, now)).toEqual({ action: 'reject', reason: 'unknown' });
  });

  it('rejects an expired token', () => {
    expect(evaluateRefresh({ revokedAt: null, expiresAt: past }, now)).toEqual({
      action: 'reject',
      reason: 'expired',
    });
  });

  it('detects reuse of a rotated/revoked token → revoke the family (theft, SC-003)', () => {
    expect(evaluateRefresh({ revokedAt: past, expiresAt: future }, now)).toEqual({
      action: 'revoke-family',
      reason: 'reuse',
    });
  });
});
