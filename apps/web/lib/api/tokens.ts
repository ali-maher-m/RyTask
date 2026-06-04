'use client';

import type { ApiTokenDto, ApiTokenSecret, CreateApiToken } from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Personal Access Token resource module (D8). `/api-tokens` — mint (secret once), list, revoke. */

interface TokenListResponse {
  data: ApiTokenDto[];
}

/** GET /api-tokens — the principal's tokens (never includes secrets). */
export async function listTokens(): Promise<ApiTokenDto[]> {
  const body = await authedRequest<TokenListResponse>('/api-tokens');
  return body.data;
}

/**
 * POST /api-tokens — mint a scoped PAT. The `secret` is returned EXACTLY ONCE (NFR-WEB-005);
 * surface it with a copy-now affordance and never persist, log, or re-render it.
 */
export async function createToken(input: CreateApiToken): Promise<ApiTokenSecret> {
  const body = await authedRequest<ResourceEnvelope<ApiTokenSecret>>('/api-tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /api-tokens/{id} — revoke immediately. */
export function revokeToken(id: string): Promise<void> {
  return authedRequest<void>(`/api-tokens/${id}`, { method: 'DELETE' });
}
