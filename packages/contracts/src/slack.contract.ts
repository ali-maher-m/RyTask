import { z } from 'zod';

/**
 * Slack integration DTOs (M3, single contract source; slack-rest.md §C). The connection
 * status + user-mapping shapes the web admin surface and the Slack admin REST endpoints
 * share. Secrets (bot token, signing secret) NEVER appear in any DTO (Principle VI).
 */

/** GET /integrations/slack — connection status (read-only for non-admins, US1.2). */
export interface SlackConnectionDto {
  status: 'not_connected' | 'connected';
  team: { id: string; name: string } | null;
  connectedAt: string | null;
  defaultProjectId: string | null;
}

/** A Slack ↔ RyTask user mapping row (mapped or unmapped — US5). */
export interface SlackUserMappingDto {
  slackUserId: string;
  slackUserName: string | null;
  slackUserEmail: string | null;
  /** The linked RyTask user, or null when unmapped (capture still works; user prompted to link). */
  mappedUserId: string | null;
  mappedManually: boolean;
}

/**
 * PATCH /integrations/slack — update connection settings. Only `defaultProjectId` is mutable in
 * M3 (the slash capture-routing target); `null` clears it. Unknown fields rejected (`.strict`).
 */
export const updateSlackConnectionSchema = z
  .object({ defaultProjectId: z.string().uuid().nullable().optional() })
  .strict();
export type UpdateSlackConnection = z.infer<typeof updateSlackConnectionSchema>;

/**
 * POST /integrations/slack/users/{slackUserId}/map — link a Slack user to a RyTask user
 * (`mappedManually = true`). Unknown fields rejected (`.strict`).
 */
export const mapSlackUserSchema = z.object({ userId: z.string().uuid() }).strict();
export type MapSlackUser = z.infer<typeof mapSlackUserSchema>;
