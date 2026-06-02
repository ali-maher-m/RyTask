import { describe, expect, it } from 'vitest';
import {
  type InviteStateLike,
  inviteExpiresAt,
  inviteState,
  isRedeemable,
  normalizeInviteEmail,
} from './invitation.policy';

/**
 * Unit tests for the invitation state machine (T060, US3 AC3/AC4, FR-AUTH-011). Pure rules:
 * pending → accepted/revoked/expired with the most-restrictive-terminal-state precedence,
 * redeemability, expiry math, and email normalization (matches the partial-unique index).
 */
const NOW = new Date('2026-06-02T00:00:00.000Z');
const future = new Date(NOW.getTime() + 60_000);
const past = new Date(NOW.getTime() - 60_000);

const live: InviteStateLike = { acceptedAt: null, revokedAt: null, expiresAt: future };

describe('invitation.policy', () => {
  describe('inviteState', () => {
    it('is PENDING while unredeemed and unexpired', () => {
      expect(inviteState(live, NOW)).toBe('PENDING');
    });

    it('is EXPIRED once past expiry (boundary is inclusive → expired)', () => {
      expect(inviteState({ ...live, expiresAt: past }, NOW)).toBe('EXPIRED');
      expect(inviteState({ ...live, expiresAt: NOW }, NOW)).toBe('EXPIRED');
    });

    it('is ACCEPTED when acceptedAt is set', () => {
      expect(inviteState({ ...live, acceptedAt: NOW }, NOW)).toBe('ACCEPTED');
    });

    it('is REVOKED when revokedAt is set', () => {
      expect(inviteState({ ...live, revokedAt: NOW }, NOW)).toBe('REVOKED');
    });

    it('REVOKED takes precedence over ACCEPTED and EXPIRED', () => {
      expect(inviteState({ acceptedAt: NOW, revokedAt: NOW, expiresAt: past }, NOW)).toBe(
        'REVOKED',
      );
    });

    it('ACCEPTED takes precedence over EXPIRED', () => {
      expect(inviteState({ acceptedAt: NOW, revokedAt: null, expiresAt: past }, NOW)).toBe(
        'ACCEPTED',
      );
    });
  });

  describe('isRedeemable', () => {
    it('is true only for a PENDING invite', () => {
      expect(isRedeemable(live, NOW)).toBe(true);
      expect(isRedeemable({ ...live, acceptedAt: NOW }, NOW)).toBe(false);
      expect(isRedeemable({ ...live, revokedAt: NOW }, NOW)).toBe(false);
      expect(isRedeemable({ ...live, expiresAt: past }, NOW)).toBe(false);
    });
  });

  describe('inviteExpiresAt', () => {
    it('adds the TTL in hours to the issue time', () => {
      expect(inviteExpiresAt(NOW, 168).getTime()).toBe(NOW.getTime() + 168 * 3_600_000);
      expect(inviteExpiresAt(NOW, 1).getTime()).toBe(NOW.getTime() + 3_600_000);
    });
  });

  describe('normalizeInviteEmail', () => {
    it('lower-cases and trims a provided email', () => {
      expect(normalizeInviteEmail('  Ada@Acme.TEST ')).toBe('ada@acme.test');
    });

    it('returns null for a link invite (no/empty email)', () => {
      expect(normalizeInviteEmail(null)).toBeNull();
      expect(normalizeInviteEmail(undefined)).toBeNull();
      expect(normalizeInviteEmail('   ')).toBeNull();
    });
  });
});
