/**
 * Slack egress port (§8, M3 research D3). The real adapter wraps `@slack/web-api` (post
 * messages / open modals / look up users) + `@slack/oauth` `InstallProvider` (the consent
 * code exchange); `noopSlack` logs and is the default so `docker compose up` works with zero
 * Slack config (Principle VII). Provider/worker code depends only on this port, so it stays
 * unit-testable without hitting Slack. Per-install bot tokens are passed in (the adapter is a
 * singleton; the token is decrypted per call from the connection row).
 */

/** The result of exchanging an OAuth authorization code for an install. */
export interface SlackOAuthResult {
  teamId: string;
  teamName: string;
  botUserId: string;
  /** Plaintext bot token (`xoxb-…`); the caller encrypts it at rest via the Crypto port. */
  botToken: string;
  scopes: string[];
  /** The Slack user who performed the install (the admin who consented). */
  authedUserId: string;
}

/** A Slack workspace user (for email auto-mapping + manual linking). */
export interface SlackWorkspaceUser {
  id: string;
  name: string | null;
  email: string | null;
}

/** A message sent back to Slack — text plus optional Block Kit (built by pure functions). */
export interface SlackMessage {
  text: string;
  /** Block Kit blocks (`domain/slack-blocks.ts`); typed loosely so the port has no SDK dep. */
  blocks?: unknown[];
  /** For slash/interaction replies: only the captor (`ephemeral`) or the whole channel. */
  responseType?: 'ephemeral' | 'in_channel';
}

export interface SlackPort {
  /**
   * Build the Slack consent URL (research D16). `state` is our own HMAC-signed nonce bound to the
   * initiating org/admin; the controller 302-redirects the admin here. No token (pre-install).
   */
  buildInstallUrl(state: string): Promise<string>;
  /** Post a message to a channel (chat.postMessage) with the install's bot token. */
  postMessage(botToken: string, channel: string, message: SlackMessage): Promise<void>;
  /** Reply to a slash command / interaction via its `response_url` (no token needed). */
  respond(responseUrl: string, message: SlackMessage): Promise<void>;
  /** Open a modal within Slack's 3 s trigger window (views.open). */
  openModal(botToken: string, triggerId: string, view: unknown): Promise<void>;
  /** Exchange an OAuth authorization code for an install (team + bot token + scopes). */
  exchangeOAuthCode(code: string): Promise<SlackOAuthResult>;
  /** List the workspace's users (users.list) for email auto-mapping (FR-SLK-002). */
  listWorkspaceUsers(botToken: string): Promise<SlackWorkspaceUser[]>;
  /** Look up a single Slack user by email (users.lookupByEmail), or null when not found. */
  lookupUserByEmail(botToken: string, email: string): Promise<SlackWorkspaceUser | null>;
  /** Revoke the install's bot token (auth.revoke) on disconnect (FR-SLK-003). */
  revokeToken(botToken: string): Promise<void>;
}

/** DI token for the Slack port. */
export const SLACK = Symbol('SLACK');

/**
 * No-op dev adapter — logs instead of calling Slack, so the API runs with no Slack config.
 * Read paths return empty/null; `exchangeOAuthCode` throws (an OAuth callback can only arrive
 * when Slack is actually configured, so reaching it here is a misconfiguration).
 */
export const noopSlack: SlackPort = {
  async buildInstallUrl(state: string): Promise<string> {
    console.log(`[slack:noop] buildInstallUrl state=${state.slice(0, 8)}…`);
    return 'about:blank#slack-not-configured';
  },
  async postMessage(_botToken: string, channel: string, message: SlackMessage): Promise<void> {
    console.log(`[slack:noop] postMessage ${channel}: ${message.text}`);
  },
  async respond(responseUrl: string, message: SlackMessage): Promise<void> {
    console.log(`[slack:noop] respond ${responseUrl}: ${message.text}`);
  },
  async openModal(_botToken: string, triggerId: string): Promise<void> {
    console.log(`[slack:noop] openModal trigger=${triggerId}`);
  },
  async exchangeOAuthCode(): Promise<SlackOAuthResult> {
    throw new Error(
      'Slack is not configured (noop adapter): set SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_SIGNING_SECRET.',
    );
  },
  async listWorkspaceUsers(): Promise<SlackWorkspaceUser[]> {
    return [];
  },
  async lookupUserByEmail(): Promise<SlackWorkspaceUser | null> {
    return null;
  },
  async revokeToken(): Promise<void> {
    // Nothing to revoke when Slack is inert.
  },
};
