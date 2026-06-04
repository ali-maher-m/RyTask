'use client';

import type { Membership, SetRole } from '@rytask/contracts';
import { authedRequest } from './http';

/** Org-membership resource module (D8). `/memberships` — list, change role, remove. */

interface MembershipListResponse {
  data: Membership[];
  pageInfo?: { nextCursor: string | null; hasNextPage: boolean };
}

/** GET /memberships — the org's members (walks pages if paginated). */
export async function listMemberships(): Promise<Membership[]> {
  const all: Membership[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<MembershipListResponse>(`/memberships?${params.toString()}`);
    all.push(...page.data);
    cursor = page.pageInfo?.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
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
