import { Injectable, NotFoundException } from '@nestjs/common';
import type { SlackUserMappingDto } from '@rytask/contracts';
import { toSlackUserMappingDto } from '../domain/slack-user.mapper';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * Manually link/unlink a Slack user to a RyTask user (US5.2, FR-SLK-002). Linking sets
 * `mapped_manually = true` so a later auto-map on reconnect never clobbers the admin's choice
 * (the repository's upsert preserves manual rows); unlinking clears the link back to unmapped —
 * capture still works, the captor is simply prompted to link. Both are idempotent and operate on
 * the org's active connection, tenant-scoped (Principle II); an unknown Slack user → 404.
 */
@Injectable()
export class MapSlackUserProvider {
  constructor(
    private readonly workspaces: SlackWorkspacesRepository,
    private readonly slackUsers: SlackUsersRepository,
  ) {}

  /** Resolve the org's active (non-revoked) connection id, or 404 when none exists. */
  private async activeConnectionId(): Promise<string> {
    const connection = await this.workspaces.findForOrg();
    if (!connection || connection.revokedAt) {
      throw new NotFoundException('no Slack connection');
    }
    return connection.id;
  }

  async map(slackUserId: string, userId: string): Promise<SlackUserMappingDto> {
    const connectionId = await this.activeConnectionId();
    const row = await this.slackUsers.setMapping(connectionId, slackUserId, userId);
    if (!row) {
      throw new NotFoundException('slack user not found');
    }
    return toSlackUserMappingDto(row);
  }

  async unmap(slackUserId: string): Promise<void> {
    const connectionId = await this.activeConnectionId();
    const row = await this.slackUsers.clearMapping(connectionId, slackUserId);
    if (!row) {
      throw new NotFoundException('slack user not found');
    }
  }
}
