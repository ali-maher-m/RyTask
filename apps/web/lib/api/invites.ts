'use client';

import type { CreateInvite, Invitation, InvitationCreated } from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/**
 * Invitations resource module (D8). Authenticated invite management — create (by email or
 * shareable link), list pending, revoke. The public preview/accept calls live in `lib/api/auth`.
 */

interface InviteListResponse {
  data: Invitation[];
}

/** GET /invites — pending invitations for the org. */
export async function listInvites(): Promise<Invitation[]> {
  const body = await authedRequest<InviteListResponse>('/invites');
  return body.data;
}

/** POST /invites — invite by email or create a shareable link with a pre-assigned role. */
export async function createInvite(input: CreateInvite): Promise<InvitationCreated> {
  const body = await authedRequest<ResourceEnvelope<InvitationCreated>>('/invites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /invites/{id}/_revoke — revoke a pending invitation. */
export function revokeInvite(id: string): Promise<void> {
  return authedRequest<void>(`/invites/${id}/_revoke`, { method: 'DELETE' });
}
