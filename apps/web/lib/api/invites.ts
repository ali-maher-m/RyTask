'use client';

import type { CreateInvite, Invitation, InvitationCreated } from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * Invitations resource module (D8). Authenticated invite management — create (by email or
 * shareable link), list pending, revoke. The public preview/accept calls live in `lib/api/auth`.
 * The `/invites` routes return their resources **bare** (no `{ data }` envelope), so we consume the
 * DTO directly.
 */

/** GET /invites — pending invitations for the org. */
export function listInvites(): Promise<Invitation[]> {
  return authedRequest<Invitation[]>('/invites');
}

/** POST /invites — invite by email or create a shareable link with a pre-assigned role. */
export function createInvite(input: CreateInvite): Promise<InvitationCreated> {
  return authedRequest<InvitationCreated>('/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /invites/{id}/_revoke — revoke a pending invitation. */
export function revokeInvite(id: string): Promise<void> {
  return authedRequest<void>(`/invites/${id}/_revoke`, { method: 'DELETE' });
}
