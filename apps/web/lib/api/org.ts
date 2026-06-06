'use client';

import type { Organization, TransferOwnership, UpdateOrgSettings } from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * Org settings resource module (D8). `GET/PATCH /orgs/current`, ownership transfer. The M0 org
 * routes return the resource **bare** (no `{ data }` envelope), so we consume the DTO directly.
 */

/** GET /orgs/current — the current tenant (name, slug, settings: tz/locale/week-start/hours). */
export function getCurrentOrg(): Promise<Organization> {
  return authedRequest<Organization>('/orgs/current');
}

/** PATCH /orgs/current — partial settings update (org-admin only; server-enforced). */
export function updateCurrentOrg(input: UpdateOrgSettings): Promise<Organization> {
  return authedRequest<Organization>('/orgs/current', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** POST /orgs/current/transfer-ownership — owner-only (last-owner guarded server-side). */
export function transferOwnership(input: TransferOwnership): Promise<void> {
  return authedRequest<void>('/orgs/current/transfer-ownership', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /orgs/current — soft-delete (deactivate) the organization (owner-only; server-enforced). */
export function deleteCurrentOrg(): Promise<void> {
  return authedRequest<void>('/orgs/current', { method: 'DELETE' });
}
