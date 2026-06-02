/**
 * Invitation lifecycle domain rules (research D8, FR-AUTH-011). Pure (no I/O) → unit-tested
 * at high coverage. An invite is a one-shot, time-limited grant: it may be redeemed only
 * while PENDING; accept/revoke are terminal and expiry is time-based. Redeeming an
 * accepted/revoked/expired invite is refused (US3 AC3); accept-time idempotency for an
 * existing member is handled in the provider (US3 AC4).
 */

export type InviteState = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

/** The fields of an `invitations` row needed to evaluate its state (structural). */
export interface InviteStateLike {
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
}

/**
 * Resolve an invite's lifecycle state. Precedence is REVOKED → ACCEPTED → EXPIRED → PENDING:
 * a revoked invite stays revoked even if it was also accepted/expired, so the most
 * restrictive terminal state always wins.
 */
export function inviteState(invite: InviteStateLike, now: Date): InviteState {
  if (invite.revokedAt !== null) {
    return 'REVOKED';
  }
  if (invite.acceptedAt !== null) {
    return 'ACCEPTED';
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'PENDING';
}

/** Only a PENDING invite may be redeemed (previewed as live / accepted). */
export const isRedeemable = (invite: InviteStateLike, now: Date): boolean =>
  inviteState(invite, now) === 'PENDING';

/** Compute an invite's expiry from the issue time + a TTL in hours. */
export const inviteExpiresAt = (now: Date, expiresInHours: number): Date =>
  new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

/**
 * Normalize an invite email for storage/comparison: trimmed + lower-cased, or `null` for a
 * shareable-link invite. Matches the partial-unique index `lower(email)` so one live invite
 * exists per address regardless of the casing the inviter typed.
 */
export const normalizeInviteEmail = (email: string | null | undefined): string | null => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};
