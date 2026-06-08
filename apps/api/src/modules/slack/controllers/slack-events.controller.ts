import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/rbac/decorators';
import {
  CAPTURE_MODAL_CALLBACK_ID,
  extractCaptureFields,
  parseCaptureModalContext,
} from '../domain/slack-blocks';
import { SlackSignatureGuard } from '../guards/slack-signature.guard';
import { SlackCaptureQueue } from '../processors/slack-capture.queue';
import { OpenCaptureModalProvider } from '../providers/open-capture-modal.provider';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/** A Slack slash-command / interaction acknowledgement (an ephemeral 200 within the 3 s window). */
interface SlackAck {
  response_type: 'ephemeral';
  text: string;
}

/** Build the ephemeral ack body Slack shows the captor immediately. */
function ack(text: string): SlackAck {
  return { response_type: 'ephemeral', text };
}

/** Loosely-typed Slack interaction payload (parsed from the `payload` form field). */
interface SlackInteraction {
  type?: string;
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  view?: {
    id?: string;
    callback_id?: string;
    private_metadata?: unknown;
    state?: { values?: unknown };
  };
}

/**
 * Slack webhook edge (M3, US2/US3, slack-capture-flow §2/§3/§4). Both routes are `@Public` (Slack
 * carries no RyTask bearer token) and authenticated by {@link SlackSignatureGuard} (HMAC over the
 * raw body) — a forged request is 401'd before any work. Each handler does the MINIMUM synchronous
 * work and returns within Slack's 3 s window:
 *   - `POST /commands` — `/task` slash. With text → enqueue a capture job + ack. With NO text → open
 *     the interactive modal synchronously (needs the `trigger_id` within 3 s) + ack.
 *   - `POST /interactivity` — `view_submission` of the capture modal → enqueue a modal-submit job.
 * The heavy create always runs async on the worker (FR-SLK-014).
 */
@Controller('integrations/slack')
@Public()
@UseGuards(SlackSignatureGuard)
export class SlackEventsController {
  constructor(
    private readonly workspaces: SlackWorkspacesRepository,
    private readonly captureQueue: SlackCaptureQueue,
    private readonly modal: OpenCaptureModalProvider,
  ) {}

  @Post('commands')
  @HttpCode(200)
  async commands(@Body() body: Record<string, string>): Promise<SlackAck | undefined> {
    const teamId = body.team_id ?? '';
    const text = (body.text ?? '').trim();

    const connection = await this.workspaces.findByTeamId(teamId);
    if (!connection || connection.revokedAt) {
      return ack(
        "RyTask isn't connected to this Slack workspace yet. An admin can connect it in *Settings → Integrations*.",
      );
    }

    if (text.length === 0) {
      // No text → open the guided modal synchronously (US3). `views.open` needs the trigger_id
      // within 3 s, so it is NOT queued; the slash response_url is carried for the later confirmation.
      await this.modal.open(connection, body.trigger_id ?? '', {
        responseUrl: body.response_url ?? null,
        channelId: body.channel_id ?? null,
      });
      return; // empty 200 — Slack opens the modal it received from views.open
    }

    // Enqueue is the only synchronous work on the hot path (deterministic, idempotent jobId).
    await this.captureQueue.enqueue({
      kind: 'slash',
      teamId,
      slackUserId: body.user_id ?? '',
      channelId: body.channel_id ?? null,
      responseUrl: body.response_url ?? '',
      triggerId: body.trigger_id ?? '',
      text,
    });

    return ack(':hourglass_flowing_sand: On it — capturing…');
  }

  @Post('interactivity')
  @HttpCode(200)
  async interactivity(@Body() body: Record<string, string>): Promise<void> {
    const payload = parseInteraction(body.payload);
    // Only the capture-modal submission is handled; everything else is acked (empty 200) + ignored.
    if (
      payload?.type !== 'view_submission' ||
      payload.view?.callback_id !== CAPTURE_MODAL_CALLBACK_ID
    ) {
      return;
    }
    const teamId = payload.team?.id ?? '';
    const connection = await this.workspaces.findByTeamId(teamId);
    if (!connection || connection.revokedAt) {
      return;
    }
    const fields = extractCaptureFields(payload.view);
    const meta = parseCaptureModalContext(payload.view?.private_metadata);

    await this.captureQueue.enqueue({
      kind: 'modal_submit',
      teamId,
      slackUserId: payload.user?.id ?? '',
      channelId: meta.channelId,
      responseUrl: meta.responseUrl,
      // The view id is unique per opened modal → deterministic, idempotent job id on resubmit.
      triggerId: payload.view?.id ?? payload.trigger_id ?? '',
      fields: {
        projectId: connection.defaultProjectId ?? '',
        title: fields.title,
        description: fields.description ?? null,
        priority: fields.priority,
        dueDate: fields.dueDate ?? null,
      },
    });
  }
}

/** Parse the urlencoded `payload` form field Slack sends for interactions (safe on garbled input). */
function parseInteraction(payload: string | undefined): SlackInteraction | null {
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload) as SlackInteraction;
  } catch {
    return null;
  }
}
