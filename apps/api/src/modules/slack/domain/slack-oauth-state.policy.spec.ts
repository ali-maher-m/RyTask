import { describe, expect, it } from 'vitest';
import { signOAuthState, verifyOAuthState } from './slack-oauth-state.policy';

/**
 * Unit test for the OAuth `state` nonce (T028, US1, research D16): HMAC sign/verify round-trip,
 * org binding, TTL expiry, and tamper/wrong-key rejection. Pure — no infrastructure.
 */
const SECRET = 'test-signing-secret';
const PAYLOAD = { organizationId: 'org-1', workspaceId: 'ws-1', adminUserId: 'user-1' };
const NOW = new Date('2026-06-06T12:00:00.000Z');

describe('slack-oauth-state.policy', () => {
  it('round-trips a signed state and preserves the org binding', () => {
    const state = signOAuthState(PAYLOAD, SECRET, NOW);
    expect(verifyOAuthState(state, SECRET, NOW)).toEqual(PAYLOAD);
  });

  it('rejects a tampered body (same signature, swapped org)', () => {
    const dot = signOAuthState(PAYLOAD, SECRET, NOW).lastIndexOf('.');
    const signature = signOAuthState(PAYLOAD, SECRET, NOW).slice(dot + 1);
    const forgedBody = Buffer.from(
      JSON.stringify({ ...PAYLOAD, organizationId: 'org-EVIL', exp: 9_999_999_999, nonce: 'x' }),
      'utf8',
    ).toString('base64url');
    expect(verifyOAuthState(`${forgedBody}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('rejects a state signed with a different key', () => {
    const state = signOAuthState(PAYLOAD, SECRET, NOW);
    expect(verifyOAuthState(state, 'a-different-secret', NOW)).toBeNull();
  });

  it('rejects an expired state (now past exp)', () => {
    const state = signOAuthState(PAYLOAD, SECRET, NOW, 60);
    const later = new Date(NOW.getTime() + 120_000); // 2 min later > 60 s TTL
    expect(verifyOAuthState(state, SECRET, later)).toBeNull();
  });

  it('accepts a state still inside its TTL', () => {
    const state = signOAuthState(PAYLOAD, SECRET, NOW, 600);
    const soon = new Date(NOW.getTime() + 300_000); // 5 min < 10 min TTL
    expect(verifyOAuthState(state, SECRET, soon)).toEqual(PAYLOAD);
  });

  it('rejects garbage / empty input', () => {
    expect(verifyOAuthState('not-a-state', SECRET, NOW)).toBeNull();
    expect(verifyOAuthState('', SECRET, NOW)).toBeNull();
    expect(verifyOAuthState('a.b.c', SECRET, NOW)).toBeNull();
  });
});
