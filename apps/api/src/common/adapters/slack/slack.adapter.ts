import { Inject, Injectable } from '@nestjs/common';
import { InstallProvider } from '@slack/oauth';
import { WebClient } from '@slack/web-api';
import { type IntegrationsConfigType, integrationsConfig } from '../../config/integrations.config';
import type {
  SlackMessage,
  SlackOAuthResult,
  SlackPort,
  SlackWorkspaceUser,
} from '../../ports/slack.port';

/**
 * Bot scopes the RyTask Slack app requests (M3): `commands` (the `/task` slash command),
 * `chat:write` (post confirmations), `users:read` + `users:read.email` (email auto-mapping +
 * lookup), `team:read` (team name). Granular per-channel scopes are v2.
 */
const BOT_SCOPES = ['commands', 'chat:write', 'users:read', 'users:read.email', 'team:read'];

/**
 * Real Slack adapter (M3, research D3) — implements {@link SlackPort} over `@slack/web-api`
 * (Web API calls) + `@slack/oauth` `InstallProvider` (the consent URL). It owns NO HTTP server
 * (unlike Bolt) — routing stays in Nest controllers and signature verification in our own guard.
 * Selected by `PortsModule` only when Slack env is configured; otherwise `noopSlack` is bound.
 * Per-install bot tokens are passed in per call (decrypted from the connection row by the caller).
 */
@Injectable()
export class SlackAdapter implements SlackPort {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string | undefined;
  private readonly installer: InstallProvider;

  constructor(@Inject(integrationsConfig.KEY) config: IntegrationsConfigType) {
    const { clientId, clientSecret, signingSecret, oauthCallbackUrl } = config.slack;
    this.clientId = clientId ?? '';
    this.clientSecret = clientSecret ?? '';
    this.redirectUri = oauthCallbackUrl;
    // We manage our own signed `state` nonce (research D16), so the SDK's state store is off.
    this.installer = new InstallProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      stateSecret: signingSecret ?? 'rytask-slack',
      stateVerification: false,
    });
  }

  async buildInstallUrl(state: string): Promise<string> {
    // stateVerification=false + explicit `state` → the SDK assembles client_id/scope/redirect_uri
    // and carries OUR signed nonce as the `state` param.
    return this.installer.generateInstallUrl(
      { scopes: BOT_SCOPES, redirectUri: this.redirectUri },
      false,
      state,
    );
  }

  async postMessage(botToken: string, channel: string, message: SlackMessage): Promise<void> {
    await new WebClient(botToken).chat.postMessage({
      channel,
      text: message.text,
      blocks: message.blocks as never,
    });
  }

  async respond(responseUrl: string, message: SlackMessage): Promise<void> {
    // A response_url is a pre-signed delivery target — no token; deliver via plain POST.
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks,
        response_type: message.responseType ?? 'ephemeral',
      }),
    });
  }

  async openModal(botToken: string, triggerId: string, view: unknown): Promise<void> {
    await new WebClient(botToken).views.open({ trigger_id: triggerId, view: view as never });
  }

  async exchangeOAuthCode(code: string): Promise<SlackOAuthResult> {
    const res = await new WebClient().oauth.v2.access({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUri,
    });
    const botToken = res.access_token;
    const teamId = res.team?.id;
    if (!botToken || !teamId) {
      throw new Error('Slack OAuth exchange did not return a bot token / team');
    }
    return {
      teamId,
      teamName: res.team?.name ?? teamId,
      botUserId: res.bot_user_id ?? '',
      botToken,
      scopes: res.scope ? res.scope.split(',') : [],
      authedUserId: res.authed_user?.id ?? '',
    };
  }

  async listWorkspaceUsers(botToken: string): Promise<SlackWorkspaceUser[]> {
    const res = await new WebClient(botToken).users.list({});
    return (res.members ?? [])
      .filter((m) => !m.deleted && !m.is_bot && m.id && m.id !== 'USLACKBOT')
      .map((m) => ({
        id: m.id as string,
        name: m.profile?.real_name ?? m.real_name ?? m.name ?? null,
        email: m.profile?.email ?? null,
      }));
  }

  async lookupUserByEmail(botToken: string, email: string): Promise<SlackWorkspaceUser | null> {
    try {
      const res = await new WebClient(botToken).users.lookupByEmail({ email });
      const u = res.user;
      if (!u?.id) return null;
      return {
        id: u.id,
        name: u.profile?.real_name ?? u.real_name ?? u.name ?? null,
        email: u.profile?.email ?? email,
      };
    } catch {
      // users_not_found etc. — treat as "no match" rather than an error (auto-map is best-effort).
      return null;
    }
  }

  async revokeToken(botToken: string): Promise<void> {
    await new WebClient(botToken).auth.revoke();
  }
}
