/**
 * Refresh-token rotation domain rules (US2, FR-AUTH-002, research D3). Pure (no I/O) →
 * unit-tested. Encodes the rotation + family-reuse-detection state machine: presenting an
 * already-rotated/revoked refresh token is treated as theft and revokes the whole family.
 */
export interface RefreshSessionState {
  revokedAt: Date | null;
  expiresAt: Date;
}

export type RefreshDecision =
  /** Valid active token → rotate (issue new, revoke this one) within the same family. */
  | { action: 'rotate' }
  /** Unknown or expired token → reject (401), no family action. */
  | { action: 'reject'; reason: 'unknown' | 'expired' }
  /** A revoked/rotated token presented again → theft → revoke the whole family (401). */
  | { action: 'revoke-family'; reason: 'reuse' };

/** Decide what to do when a refresh token is presented. */
export function evaluateRefresh(session: RefreshSessionState | null, now: Date): RefreshDecision {
  if (!session) {
    return { action: 'reject', reason: 'unknown' };
  }
  if (session.revokedAt !== null) {
    // The token was already rotated or revoked — its reappearance signals theft.
    return { action: 'revoke-family', reason: 'reuse' };
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    return { action: 'reject', reason: 'expired' };
  }
  return { action: 'rotate' };
}
