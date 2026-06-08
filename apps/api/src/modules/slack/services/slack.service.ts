import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  SlackConnectionDto,
  SlackUserMappingDto,
  UpdateSlackConnection,
} from '@rytask/contracts';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import {
  type IntegrationsConfigType,
  integrationsConfig,
} from '../../../common/config/integrations.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { SLACK, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { signOAuthState, verifyOAuthState } from '../domain/slack-oauth-state.policy';
import { ConnectSlackProvider } from '../providers/connect-slack.provider';
import { DisconnectSlackProvider } from '../providers/disconnect-slack.provider';
import { GetConnectionProvider } from '../providers/get-connection.provider';
import { ListSlackUsersProvider } from '../providers/list-slack-users.provider';
import { MapSlackUserProvider } from '../providers/map-slack-user.provider';
import type { SlackService } from '../slack.contract';

/**
 * Slack application service (M3, US1) — the module's public surface ({@link SlackService}). It
 * composes the per-operation providers and owns the OAuth-`state` lifecycle (research D16):
 * `beginInstall` signs a state nonce bound to the current admin's org/workspace and builds the
 * consent URL; `completeInstall` verifies that state (the callback carries no session) and
 * re-establishes tenant context from it before connecting. Status/settings/disconnect run inside
 * the authed request's tenant context. One brain everywhere — no Slack-specific domain logic here.
 */
@Injectable()
export class SlackServiceImpl implements SlackService {
  constructor(
    @Inject(SLACK) private readonly slack: SlackPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    @Inject(integrationsConfig.KEY) private readonly integrations: IntegrationsConfigType,
    @Inject(authConfig.KEY) private readonly auth: AuthConfigType,
    private readonly connectProvider: ConnectSlackProvider,
    private readonly disconnectProvider: DisconnectSlackProvider,
    private readonly getConnectionProvider: GetConnectionProvider,
    private readonly listSlackUsersProvider: ListSlackUsersProvider,
    private readonly mapSlackUserProvider: MapSlackUserProvider,
    private readonly tenant: TenantContextService,
  ) {}

  /** The HMAC key for OAuth state: the Slack signing secret, else the server secret (always set). */
  private stateSecret(): string {
    return this.integrations.slack.signingSecret ?? this.auth.jwt.secret;
  }

  getConnection(): Promise<SlackConnectionDto> {
    return this.getConnectionProvider.getConnection();
  }

  updateConnection(input: UpdateSlackConnection): Promise<SlackConnectionDto> {
    return this.getConnectionProvider.updateSettings(input);
  }

  disconnect(): Promise<void> {
    return this.disconnectProvider.disconnect();
  }

  listSlackUsers(): Promise<SlackUserMappingDto[]> {
    return this.listSlackUsersProvider.list();
  }

  mapSlackUser(slackUserId: string, userId: string): Promise<SlackUserMappingDto> {
    return this.mapSlackUserProvider.map(slackUserId, userId);
  }

  unmapSlackUser(slackUserId: string): Promise<void> {
    return this.mapSlackUserProvider.unmap(slackUserId);
  }

  async beginInstall(): Promise<{ url: string }> {
    const ctx = this.tenant.get();
    const workspaceId =
      ctx.workspaceId ?? (await this.orgAccess.getDefaultWorkspaceId(ctx.organizationId)) ?? null;
    const adminUserId = ctx.userId;
    if (!workspaceId || !adminUserId) {
      throw new BadRequestException('cannot start Slack install without a workspace + admin');
    }
    const state = signOAuthState(
      { organizationId: ctx.organizationId, workspaceId, adminUserId },
      this.stateSecret(),
      this.clock.now(),
    );
    const url = await this.slack.buildInstallUrl(state);
    return { url };
  }

  async completeInstall({ code, state }: { code: string; state: string }): Promise<void> {
    const payload = verifyOAuthState(state, this.stateSecret(), this.clock.now());
    if (!payload) {
      // Declined / interrupted / forged consent → no partial connection is recorded.
      throw new BadRequestException('invalid or expired Slack state');
    }
    // The callback has no session — re-establish tenant context from the verified state only.
    await this.tenant.run(
      {
        organizationId: payload.organizationId,
        workspaceId: payload.workspaceId,
        userId: payload.adminUserId,
      },
      () => this.connectProvider.connect(code),
    );
  }
}
