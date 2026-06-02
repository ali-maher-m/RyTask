/**
 * Password domain rules (US2, NFR-SEC-002). Pure (no I/O) → unit-tested. The DTO also
 * enforces length via Zod; this is the authoritative domain check reused server-side.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordRejection = 'TOO_SHORT' | 'TOO_LONG';
export type PasswordCheck = { ok: true } | { ok: false; reason: PasswordRejection };

/** Validate a candidate password's strength (length bounds for M0). */
export function checkPasswordStrength(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'TOO_SHORT' };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: 'TOO_LONG' };
  }
  return { ok: true };
}
