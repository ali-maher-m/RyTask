import { Module } from '@nestjs/common';
import { GithubAdminController } from './controllers/github-admin.controller';
import { GithubWebhookController } from './controllers/github-webhook.controller';
import { GithubLinkProcessor } from './processors/github-link.processor';
import { GithubLinkQueue } from './processors/github-link.queue';
import { ConnectGithubProvider } from './providers/connect-github.provider';
import { DisconnectGithubProvider } from './providers/disconnect-github.provider';
import { ListGithubConnectionsProvider } from './providers/list-github-connections.provider';
import { GithubConnectionsRepository } from './repositories/github-connections.repository';
import { GithubLinksRepository } from './repositories/github-links.repository';

/**
 * GitHub bounded module (M5, FR-INT-GH-006/007 — the Slack-module shape). Owns the repository
 * connections + commit/PR links; it touches work items ONLY through the `WORK_ITEM_ACCESS`
 * contract port (`getItemContextByKey` / `recordGitHubLinked` — Principle III; `WorkItemsModule`
 * is `@Global`, so no import needed). Secret-at-rest encryption sits behind the `Crypto` port.
 * Webhook edge → queue (deterministic delivery-id jobs) → worker processor; the heavy work never
 * runs on the request path.
 */
@Module({
  controllers: [GithubWebhookController, GithubAdminController],
  providers: [
    GithubConnectionsRepository,
    GithubLinksRepository,
    ConnectGithubProvider,
    DisconnectGithubProvider,
    ListGithubConnectionsProvider,
    GithubLinkProcessor,
    GithubLinkQueue,
  ],
})
export class GithubModule {}
