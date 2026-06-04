'use client';

import type { Organization, TransferOwnership, UpdateOrgSettings } from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Org settings resource module (D8). `GET/PATCH /orgs/current`, ownership transfer. */

/** GET /orgs/current — the current tenant (name, slug, settings: tz/locale/week-start/hours). */
export async function getCurrentOrg(): Promise<Organization> {
  const body = await authedRequest<ResourceEnvelope<Organization>>('/orgs/current');
  return body.data;
}

/** PATCH /orgs/current — partial settings update (org-admin only; server-enforced). */
export async function updateCurrentOrg(input: UpdateOrgSettings): Promise<Organization> {
  const body = await authedRequest<ResourceEnvelope<Organization>>('/orgs/current', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** POST /orgs/current/transfer-ownership — owner-only (last-owner guarded server-side). */
export function transferOwnership(input: TransferOwnership): Promise<void> {
  return authedRequest<void>('/orgs/current/transfer-ownership', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
