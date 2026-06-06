'use client';

import type { ApiTokenDto, ApiTokenSecret, CreateApiToken } from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * Personal Access Token resource module (D8). `/api-tokens` — mint (secret once), list, revoke.
 * The `/api-tokens` routes return their resources **bare** (no `{ data }` envelope), so we consume
 * the DTO directly.
 */

/** GET /api-tokens — the principal's tokens (never includes secrets). */
export function listTokens(): Promise<ApiTokenDto[]> {
  return authedRequest<ApiTokenDto[]>('/api-tokens');
}

/**
 * POST /api-tokens — mint a scoped PAT. The `secret` is returned EXACTLY ONCE (NFR-WEB-005);
 * surface it with a copy-now affordance and never persist, log, or re-render it.
 */
export function createToken(input: CreateApiToken): Promise<ApiTokenSecret> {
  return authedRequest<ApiTokenSecret>('/api-tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /api-tokens/{id} — revoke immediately. */
export function revokeToken(id: string): Promise<void> {
  return authedRequest<void>(`/api-tokens/${id}`, { method: 'DELETE' });
}
