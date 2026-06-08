import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CRYPTO, type Crypto } from '../../../common/crypto/crypto.port';
import { SLACK, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { USER_PROVISIONING, type UserProvisioningService } from '../../identity/identity.contract';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * Complete a Slack install (US1, FR-SLK-001/002, research D16). Runs INSIDE a tenant context the
 * caller established from the verified OAuth `state` (org + workspace + admin) — never from a
 * client field (Principle II). It exchanges the code for a bot token, stores it ENCRYPTED at rest
 * (Crypto port, AES-256-GCM), upserts the connection (idempotent reconnect → clears `revoked_at`),
 * and auto-maps Slack users to RyTask users by email. Capture is never blocked on an unmatched
 * user — they simply stay unmapped (`user_id = null`) until linked.
 */
@Injectable()
export class ConnectSlackProvider {
  constructor(
    @Inject(SLACK) private readonly slack: SlackPort,
    @Inject(CRYPTO) private readonly crypto: Crypto,
    @Inject(USER_PROVISIONING) private readonly users: UserProvisioningService,
    private readonly workspaces: SlackWorkspacesRepository,
    private readonly slackUsers: SlackUsersRepository,
    private readonly tenant: TenantContextService,
  ) {}

  /** Exchange the OAuth `code`, persist the encrypted connection, and auto-map users by email. */
  async connect(code: string): Promise<void> {
    const ctx = this.tenant.get();
    const workspaceId = ctx.workspaceId;
    const installedByUserId = ctx.userId;
    if (!workspaceId || !installedByUserId) {
      throw new BadRequestException('cannot complete Slack install without a workspace + admin');
    }

    const oauth = await this.slack.exchangeOAuthCode(code);
    const encrypted = this.crypto.encrypt(oauth.botToken);

    const connection = await this.workspaces.upsert({
      workspaceId,
      slackTeamId: oauth.teamId,
      slackTeamName: oauth.teamName,
      botUserId: oauth.botUserId,
      botTokenCiphertext: encrypted.ciphertext,
      botTokenIv: encrypted.iv,
      botTokenTag: encrypted.tag,
      scopes: oauth.scopes,
      installedByUserId,
    });

    await this.autoMapUsersByEmail(connection.id, oauth.botToken);
  }

  /**
   * For each Slack workspace user, resolve a RyTask user by matching email (global find — the
   * invitee may already have an account) and upsert the mapping. Best-effort: an unmatched Slack
   * user is stored unmapped (FR-SLK-002 / US5 scenario 1).
   */
  private async autoMapUsersByEmail(slackWorkspaceId: string, botToken: string): Promise<void> {
    const slackWorkspaceUsers = await this.slack.listWorkspaceUsers(botToken);
    if (slackWorkspaceUsers.length === 0) {
      return;
    }
    const rows = await Promise.all(
      slackWorkspaceUsers.map(async (u) => {
        const match = u.email ? await this.users.findByEmail(u.email) : null;
        return {
          slackWorkspaceId,
          slackUserId: u.id,
          slackUserName: u.name,
          slackUserEmail: u.email,
          userId: match?.id ?? null,
        };
      }),
    );
    await this.slackUsers.upsertMany(rows);
  }
}
