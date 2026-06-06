'use client';

import type { Membership, SetRole } from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * Org-membership resource module (D8). `/memberships` — list, change role, remove. The M0
 * membership route returns a **bare** array (no `{ data }`/`pageInfo` envelope).
 */

/** GET /memberships — the org's members. */
export function listMemberships(): Promise<Membership[]> {
  return authedRequest<Membership[]>('/memberships?limit=200');
}

/** PATCH /memberships/{userId} — change a member's role (last-owner guarded server-side → 409). */
export function setMemberRole(userId: string, input: SetRole): Promise<void> {
  return authedRequest<void>(`/memberships/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** DELETE /memberships/{userId} — remove a member (last-owner guarded server-side). */
export function removeMember(userId: string): Promise<void> {
  return authedRequest<void>(`/memberships/${userId}`, { method: 'DELETE' });
}
