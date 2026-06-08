import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateWorkItemResponse } from '@rytask/contracts';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { buildCaptureConfirmation } from '../domain/slack-blocks';
import {
  CaptureFromSlackProvider,
  type SlackModalCapture,
} from '../providers/capture-from-slack.provider';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import type { SlackWorkspaceRow } from '../repositories/slack-workspaces.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * The serialized job a Slack capture carries (M3, US2/US3). It holds ONLY signature-verified,
 * server-trusted values from the webhook (the `team_id`, captor `slackUserId`, the `response_url`
 * to confirm on). The tenant is resolved on the worker side from the `team_id` → connection — never
 * a client field (Principle II). `triggerId`/`ts` make the job id deterministic for idempotency.
 */
export type SlackCaptureJob =
  | {
      kind: 'slash';
      teamId: string;
      slackUserId: string;
      channelId: string | null;
      responseUrl: string;
      triggerId: string;
      text: string;
    }
  | {
      kind: 'modal_submit';
      teamId: string;
      slackUserId: string;
      channelId: string | null;
      responseUrl: string | null;
      triggerId: string;
      fields: SlackModalCapture;
    };

/** Outcome of processing one capture job (used by tests + telemetry). */
export type SlackCaptureOutcome =
  | { status: 'created'; workItemId: string }
  | { status: 'skipped'; reason: 'disconnected' | 'no_project' | 'error' };

/**
 * Slack capture worker (M3, US2/US3, FR-SLK-010/012/013/014, research D2/D7/D8). The HANDLER is a
 * plain callable (`handle`) so the integration test can invoke it directly AND drive it via a real
 * enqueue→Worker round-trip. It:
 *   1. resolves the connection by the verified `team_id` (global lookup) — no-op if missing/revoked
 *      (no orphaned writes after disconnect, Edge Case);
 *   2. re-establishes the tenant context from the SERVER-resolved connection (`tenant.run`) under the
 *      install-admin principal so project RBAC never blocks capture (FR-SLK-012);
 *   3. resolves the captor mapping → attributes the item to that user (or `null` when unmapped);
 *   4. creates via the shared work-items capture contract (`source = 'SLACK'`); and
 *   5. confirms in Slack (item key + deep link + what wasn't applied; "link your account" if unmapped).
 *
 * Idempotency is the deterministic BullMQ `jobId` (the queue refuses a duplicate add) — no dedupe
 * table (research D7). The worker has no request ALS, so the org travels via the resolved connection.
 */
@Injectable()
export class SlackCaptureProcessor {
  private readonly logger = new Logger(SlackCaptureProcessor.name);

  constructor(
    private readonly workspaces: SlackWorkspacesRepository,
    private readonly slackUsers: SlackUsersRepository,
    private readonly capture: CaptureFromSlackProvider,
    @Inject(SLACK) private readonly slack: SlackPort,
    @Inject(authConfig.KEY) private readonly auth: AuthConfigType,
    private readonly tenant: TenantContextService,
  ) {}

  /** Process one capture job. Safe to retry; a missing/revoked connection is a silent no-op. */
  async handle(job: SlackCaptureJob): Promise<SlackCaptureOutcome> {
    const connection = await this.workspaces.findByTeamId(job.teamId);
    if (!connection || connection.revokedAt) {
      // Disconnected (or never connected): do nothing — no orphaned write (Edge Case, FR-SLK-003).
      this.logger.debug(`capture skipped: no active connection for team ${job.teamId}`);
      return { status: 'skipped', reason: 'disconnected' };
    }

    return this.tenant.run(
      {
        organizationId: connection.organizationId,
        workspaceId: connection.workspaceId,
        userId: connection.installedByUserId,
        isOrgAdmin: true,
      },
      async () => {
        const mapping = await this.slackUsers.findBySlackUserId(connection.id, job.slackUserId);
        const reporterId = mapping?.userId ?? null;
        const projectId = job.kind === 'slash' ? connection.defaultProjectId : job.fields.projectId;
        if (!projectId) {
          await this.reply(job, connection, {
            text: ':warning: RyTask has no default project for Slack capture yet. Ask an admin to pick one in *Settings → Integrations*.',
          });
          return { status: 'skipped', reason: 'no_project' };
        }

        let response: CreateWorkItemResponse;
        try {
          response =
            job.kind === 'slash'
              ? await this.capture.fromQuickAdd(projectId, job.text, reporterId)
              : await this.capture.fromModal({ ...job.fields, projectId }, reporterId);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          this.logger.warn(`capture failed for team ${job.teamId}: ${message}`);
          await this.reply(job, connection, {
            text: `:warning: Couldn't capture that — ${message}`,
          });
          return { status: 'skipped', reason: 'error' };
        }

        await this.reply(job, connection, this.confirmation(response, reporterId === null));
        return { status: 'created', workItemId: response.data.id };
      },
    );
  }

  /**
   * Confirm in Slack (FR-SLK-013, slack-capture-flow §3/§5). Delegates to the pure Block Kit builder
   * (`slack-blocks.ts`): item key as a deep link + the title, a note of unresolved quick-add tokens
   * (surfaced, never dropped), and — for an unmapped captor — a "link your account" prompt.
   */
  private confirmation(response: CreateWorkItemResponse, unmapped: boolean): SlackMessage {
    return buildCaptureConfirmation({
      key: response.data.key,
      title: response.data.title,
      link: `${this.auth.appBaseUrl}/work-items/${response.data.id}`,
      unresolved: response.meta.unresolved,
      unmapped,
    });
  }

  /** Deliver a reply: prefer the slash `response_url`; else post into the channel with the bot token. */
  private async reply(
    job: SlackCaptureJob,
    _connection: SlackWorkspaceRow,
    message: SlackMessage,
  ): Promise<void> {
    if (job.responseUrl) {
      await this.slack.respond(job.responseUrl, message);
    }
    // A modal submit without a response_url silently completes — the item is still created. A future
    // iteration can post via chat.postMessage to a stored channel (the bot token is encrypted at rest).
  }
}
