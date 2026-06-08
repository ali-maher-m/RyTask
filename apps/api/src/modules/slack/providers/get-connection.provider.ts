import { Injectable, NotFoundException } from '@nestjs/common';
import type { SlackConnectionDto, UpdateSlackConnection } from '@rytask/contracts';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * Read + settings for the org's Slack connection (US1, FR-WEB-101). A revoked/absent connection
 * reads as `not_connected` (the page shows "Not connected"); a live one returns the team + when
 * it connected + the capture default project. Settings update mutates only `defaultProjectId`.
 * Secrets (the bot token) NEVER appear in the DTO (Principle VI).
 */
@Injectable()
export class GetConnectionProvider {
  constructor(private readonly workspaces: SlackWorkspacesRepository) {}

  async getConnection(): Promise<SlackConnectionDto> {
    const connection = await this.workspaces.findForOrg();
    if (!connection || connection.revokedAt) {
      return { status: 'not_connected', team: null, connectedAt: null, defaultProjectId: null };
    }
    return {
      status: 'connected',
      team: { id: connection.slackTeamId, name: connection.slackTeamName },
      connectedAt: connection.connectedAt.toISOString(),
      defaultProjectId: connection.defaultProjectId,
    };
  }

  async updateSettings(input: UpdateSlackConnection): Promise<SlackConnectionDto> {
    const connection = await this.workspaces.findForOrg();
    if (!connection || connection.revokedAt) {
      throw new NotFoundException('no Slack connection');
    }
    if (input.defaultProjectId !== undefined) {
      await this.workspaces.updateSettings(connection.id, {
        defaultProjectId: input.defaultProjectId,
      });
    }
    return this.getConnection();
  }
}
