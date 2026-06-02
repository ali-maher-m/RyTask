import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, checkPasswordStrength } from './password.policy';

describe('password.policy', () => {
  it('accepts a password of at least 8 chars', () => {
    expect(checkPasswordStrength('abcdefgh')).toEqual({ ok: true });
    expect(checkPasswordStrength('a-strong-password')).toEqual({ ok: true });
  });

  it('rejects a too-short password', () => {
    expect(checkPasswordStrength('short')).toEqual({ ok: false, reason: 'TOO_SHORT' });
    expect(checkPasswordStrength('')).toEqual({ ok: false, reason: 'TOO_SHORT' });
  });

  it('rejects a too-long password (DoS guard on argon2 input)', () => {
    expect(checkPasswordStrength('x'.repeat(MAX_PASSWORD_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    });
  });
});
