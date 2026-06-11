import { Injectable, NotFoundException } from '@nestjs/common';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';

/**
 * Disconnect a repository (M5 — the Slack-disconnect shape). A soft revoke: the webhook stops
 * verifying/processing immediately, while existing `github_links` + `GITHUB_LINKED` activity
 * stay readable (FR-INT-GH-010 — disconnect without data loss).
 */
@Injectable()
export class DisconnectGithubProvider {
  constructor(private readonly connections: GithubConnectionsRepository) {}

  async disconnect(connectionId: string): Promise<void> {
    const revoked = await this.connections.revoke(connectionId);
    if (!revoked) {
      throw new NotFoundException('GitHub connection not found');
    }
  }
}
