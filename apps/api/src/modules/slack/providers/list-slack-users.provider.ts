import { Injectable } from '@nestjs/common';
import type { SlackUserMappingDto } from '@rytask/contracts';
import { toSlackUserMappingDto } from '../domain/slack-user.mapper';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * List the Slack ↔ RyTask user mappings for the current org's connection (US5, FR-SLK-002,
 * FR-WEB-102). Returns mapped AND unmapped rows so the admin page can highlight who still needs
 * linking. A revoked/absent connection has no rows to map, so it reads as an empty list (the page
 * shows its "not connected" empty state). Tenant-scoped — the repositories fail closed off-org.
 */
@Injectable()
export class ListSlackUsersProvider {
  constructor(
    private readonly workspaces: SlackWorkspacesRepository,
    private readonly slackUsers: SlackUsersRepository,
  ) {}

  async list(): Promise<SlackUserMappingDto[]> {
    const connection = await this.workspaces.findForOrg();
    if (!connection || connection.revokedAt) {
      return [];
    }
    const rows = await this.slackUsers.listForWorkspace(connection.id);
    return rows.map(toSlackUserMappingDto);
  }
}
