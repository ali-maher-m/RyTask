import { Module } from '@nestjs/common';
import { SlackAdminController } from './controllers/slack-admin.controller';
import { SlackEventsController } from './controllers/slack-events.controller';
import { SlackOAuthController } from './controllers/slack-oauth.controller';
import { SlackSignatureGuard } from './guards/slack-signature.guard';
import { SlackCaptureProcessor } from './processors/slack-capture.processor';
import { SlackCaptureQueue } from './processors/slack-capture.queue';
import { CaptureFromSlackProvider } from './providers/capture-from-slack.provider';
import { ConnectSlackProvider } from './providers/connect-slack.provider';
import { DisconnectSlackProvider } from './providers/disconnect-slack.provider';
import { GetConnectionProvider } from './providers/get-connection.provider';
import { ListSlackUsersProvider } from './providers/list-slack-users.provider';
import { MapSlackUserProvider } from './providers/map-slack-user.provider';
import { OpenCaptureModalProvider } from './providers/open-capture-modal.provider';
import { SlackUsersRepository } from './repositories/slack-users.repository';
import { SlackWorkspacesRepository } from './repositories/slack-workspaces.repository';
import { SlackServiceImpl } from './services/slack.service';
import { SLACK_SERVICE } from './slack.contract';

/**
 * Slack bounded module (M3, research D1) — owns the Slack connection + user-mapping state and the
 * capture domain rules. It calls other modules ONLY through their `*.contract.ts` services
 * (identity's `USER_PROVISIONING`, orgs' `ORG_ACCESS`) — never their repositories; all Slack
 * egress sits behind `SlackPort` and bot-token encryption behind `Crypto`. US1 ships the OAuth +
 * admin controllers and the connect/disconnect/status providers behind the `SLACK_SERVICE` facade;
 * US2/US3 add the signature guard, capture queue/processor, and Block Kit; US5 the user mapping.
 */
@Module({
  controllers: [SlackOAuthController, SlackAdminController, SlackEventsController],
  providers: [
    SlackWorkspacesRepository,
    SlackUsersRepository,
    ConnectSlackProvider,
    DisconnectSlackProvider,
    GetConnectionProvider,
    // US5 — Slack ↔ RyTask user mapping (list + manual link/unlink).
    ListSlackUsersProvider,
    MapSlackUserProvider,
    // US2/US3 — signature-verified capture: guard → queue (3 s ack) → worker → confirm.
    SlackSignatureGuard,
    CaptureFromSlackProvider,
    OpenCaptureModalProvider,
    SlackCaptureProcessor,
    SlackCaptureQueue,
    SlackServiceImpl,
    { provide: SLACK_SERVICE, useExisting: SlackServiceImpl },
  ],
  exports: [SLACK_SERVICE],
})
export class SlackModule {}
