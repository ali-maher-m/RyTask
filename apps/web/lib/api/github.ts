'use client';

import type {
  CreateGithubConnectionInput,
  CreateGithubConnectionResponse,
  ListGithubConnectionsResponse,
} from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * GitHub integration resource module (M5, FR-INT-GH-006/007). `/integrations/github` —
 * repository connections for lightweight magic-word linking. The webhook secret appears ONLY
 * in the create response (shown once, never retrievable again — Principle VI).
 */

/** GET /integrations/github — the org's repository connections (visible to any member). */
export function listGithubConnections(): Promise<ListGithubConnectionsResponse> {
  return authedRequest<ListGithubConnectionsResponse>('/integrations/github');
}

/** POST /integrations/github — connect a repository; returns the one-time webhook secret (admin). */
export function createGithubConnection(
  input: CreateGithubConnectionInput,
): Promise<CreateGithubConnectionResponse> {
  return authedRequest<CreateGithubConnectionResponse>('/integrations/github', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /integrations/github/{id} — disconnect (soft revoke; existing links stay) (admin). */
export function deleteGithubConnection(connectionId: string): Promise<void> {
  return authedRequest<void>(`/integrations/github/${encodeURIComponent(connectionId)}`, {
    method: 'DELETE',
  });
}
