'use client';

import type {
  SlackConnectionDto,
  SlackUserMappingDto,
  UpdateSlackConnection,
} from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * Slack integration resource module (M3, US1, web-surfaces.md §1). `/integrations/slack` —
 * connection status (any member), settings + disconnect (admin), and the install handshake.
 * These routes return their resources **bare** (no `{ data }` envelope), consumed directly.
 */

/** GET /integrations/slack — connection status (visible to any member). */
export function getSlackConnection(): Promise<SlackConnectionDto> {
  return authedRequest<SlackConnectionDto>('/integrations/slack');
}

/** PATCH /integrations/slack — update settings, e.g. the capture default project (admin). */
export function updateSlackConnection(input: UpdateSlackConnection): Promise<SlackConnectionDto> {
  return authedRequest<SlackConnectionDto>('/integrations/slack', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** DELETE /integrations/slack — disconnect: revoke + stop capture (admin, FR-WEB-103). */
export function disconnectSlack(): Promise<void> {
  return authedRequest<void>('/integrations/slack', { method: 'DELETE' });
}

/**
 * GET /integrations/slack/install — the Slack consent URL (admin). Auth is cookieless, so the
 * client fetches this with its bearer token, then navigates the page to `url` to start OAuth.
 */
export function getSlackInstallUrl(): Promise<{ url: string }> {
  return authedRequest<{ url: string }>('/integrations/slack/install');
}

// ── User mapping (US5, web-surfaces.md §3.B) — admin-only, tenant-scoped ───────────────────────

/** GET /integrations/slack/users — the connection's Slack ↔ RyTask mappings (mapped + unmapped). */
export function listSlackUsers(): Promise<SlackUserMappingDto[]> {
  return authedRequest<SlackUserMappingDto[]>('/integrations/slack/users');
}

/** POST …/users/{slackUserId}/map — link a Slack user to a RyTask user (`mappedManually`). */
export function mapSlackUser(slackUserId: string, userId: string): Promise<SlackUserMappingDto> {
  return authedRequest<SlackUserMappingDto>(
    `/integrations/slack/users/${encodeURIComponent(slackUserId)}/map`,
    { method: 'POST', body: JSON.stringify({ userId }) },
  );
}

/** DELETE …/users/{slackUserId}/map — unlink (back to unmapped; capture still works). */
export function unmapSlackUser(slackUserId: string): Promise<void> {
  return authedRequest<void>(`/integrations/slack/users/${encodeURIComponent(slackUserId)}/map`, {
    method: 'DELETE',
  });
}
