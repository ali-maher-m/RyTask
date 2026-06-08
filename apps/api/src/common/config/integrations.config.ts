import { registerAs } from '@nestjs/config';

/**
 * Typed integration configuration for the M3 channels — Slack capture (D2) and the MCP
 * server (D3). Registered via `ConfigModule` under the `integrations` namespace; every
 * secret comes from the environment (Principle VI — no secrets in code).
 *
 * Both channels are **inert by default**: when their env is unset the real adapters are
 * never selected (the `noopSlack` adapter is used and the MCP endpoint is simply not
 * advertised), so `docker compose up` works with zero Slack/MCP config (Principle VII).
 * Slack is considered configured only when the client id + secret + signing secret are all
 * present; in that case a valid 32-byte base64 token-encryption key is required (bot tokens
 * are encrypted at rest, AES-256-GCM).
 */

/** Bytes of key material AES-256-GCM needs (256 bits). */
export const SLACK_TOKEN_ENC_KEY_BYTES = 32;

/**
 * Fail fast when Slack is configured but `SLACK_TOKEN_ENC_KEY` is missing or not a 32-byte
 * base64 value — refusing to start beats storing a bot token under a bad/short key. Throwing
 * here crashes config load (mirrors {@link import('./auth.config').assertProductionJwtSecret}).
 */
export function assertSlackEncKey(tokenEncKey: string | undefined): void {
  if (!tokenEncKey) {
    throw new Error(
      'Refusing to start: SLACK_TOKEN_ENC_KEY is required when Slack is configured. Generate one with `openssl rand -base64 32`.',
    );
  }
  let byteLength: number;
  try {
    byteLength = Buffer.from(tokenEncKey, 'base64').length;
  } catch {
    byteLength = 0;
  }
  if (byteLength !== SLACK_TOKEN_ENC_KEY_BYTES) {
    throw new Error(
      `Refusing to start: SLACK_TOKEN_ENC_KEY must be a base64-encoded ${SLACK_TOKEN_ENC_KEY_BYTES}-byte key (got ${byteLength} bytes). Generate one with \`openssl rand -base64 32\`.`,
    );
  }
}

export interface SlackConfig {
  clientId?: string;
  clientSecret?: string;
  signingSecret?: string;
  /** Where Slack returns the OAuth consent (must match the app's redirect URL). */
  oauthCallbackUrl?: string;
  /** Base64-encoded 32-byte AES-256-GCM key for bot-token-at-rest encryption. */
  tokenEncKey?: string;
  /** True when the minimum to run the real Slack adapter is present (id + secret + signing). */
  configured: boolean;
}

export interface McpConfig {
  /** Public base URL the MCP HTTP/SSE transport is reachable at (surfaced on Agent-access). */
  publicUrl?: string;
}

export interface IntegrationsConfig {
  slack: SlackConfig;
  mcp: McpConfig;
}

export const integrationsConfig = registerAs('integrations', (): IntegrationsConfig => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const tokenEncKey = process.env.SLACK_TOKEN_ENC_KEY;
  const configured = Boolean(clientId && clientSecret && signingSecret);
  if (configured) {
    // A configured Slack app must have a valid encryption key (fail fast at boot).
    assertSlackEncKey(tokenEncKey);
  }
  return {
    slack: {
      clientId,
      clientSecret,
      signingSecret,
      oauthCallbackUrl: process.env.SLACK_OAUTH_CALLBACK_URL,
      tokenEncKey,
      configured,
    },
    mcp: {
      publicUrl: process.env.MCP_PUBLIC_URL,
    },
  };
});

/** DI-injectable namespace key (`@Inject(integrationsConfig.KEY)`). */
export type IntegrationsConfigType = IntegrationsConfig;
