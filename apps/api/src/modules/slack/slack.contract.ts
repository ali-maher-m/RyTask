import type {
  SlackConnectionDto,
  SlackUserMappingDto,
  UpdateSlackConnection,
} from '@rytask/contracts';

/**
 * Public surface of the Slack module (Principle III). Controllers depend on this interface
 * (resolved via {@link SLACK_SERVICE}); other modules, if they ever need Slack state, depend
 * ONLY on this file — never on the module's repositories. Inputs/outputs are `@rytask/contracts`
 * DTOs, never `@rytask/db` rows. The application service composes the per-operation providers.
 * Grows per story (US1: connect/status/disconnect; US5 adds user-mapping methods).
 */
export interface SlackService {
  /** Connection status for the current org (any member). */
  getConnection(): Promise<SlackConnectionDto>;
  /** Build the Slack consent URL for the current admin (signed `state`, research D16). */
  beginInstall(): Promise<{ url: string }>;
  /** Complete the OAuth callback: validate `state` → exchange → persist → auto-map (US1). */
  completeInstall(params: { code: string; state: string }): Promise<void>;
  /** Update connection settings — the slash capture-routing default project (admin, US1). */
  updateConnection(input: UpdateSlackConnection): Promise<SlackConnectionDto>;
  /** Disconnect: revoke the bot token + stop capture (admin, FR-SLK-003). */
  disconnect(): Promise<void>;
  /** List Slack ↔ RyTask user mappings for the org's connection (admin, US5). */
  listSlackUsers(): Promise<SlackUserMappingDto[]>;
  /** Manually link a Slack user to a RyTask user (`mappedManually`, admin, US5.2). */
  mapSlackUser(slackUserId: string, userId: string): Promise<SlackUserMappingDto>;
  /** Unlink a Slack user (clears the mapping back to unmapped, admin, US5.2). */
  unmapSlackUser(slackUserId: string): Promise<void>;
}

/** DI token for the Slack application service. */
export const SLACK_SERVICE = Symbol('SLACK_SERVICE');
