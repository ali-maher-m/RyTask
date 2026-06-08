import { Inject, Injectable } from '@nestjs/common';
import { CRYPTO, type Crypto } from '../../../common/crypto/crypto.port';
import { SLACK, type SlackPort } from '../../../common/ports/slack.port';
import { type CaptureModalContext, buildCaptureModal } from '../domain/slack-blocks';
import type { SlackWorkspaceRow } from '../repositories/slack-workspaces.repository';

/**
 * Open the capture modal (US3, FR-SLK-011, slack-capture-flow §4). `views.open` MUST be called with
 * the slash command's `trigger_id` within Slack's 3 s window, so this runs SYNCHRONOUSLY on the hot
 * path (not queued). It decrypts the install's bot token (Crypto port) and opens the pure Block Kit
 * view; the reply target is carried in the view's `private_metadata` so the worker can confirm later.
 */
@Injectable()
export class OpenCaptureModalProvider {
  constructor(
    @Inject(SLACK) private readonly slack: SlackPort,
    @Inject(CRYPTO) private readonly crypto: Crypto,
  ) {}

  async open(
    connection: SlackWorkspaceRow,
    triggerId: string,
    meta: CaptureModalContext,
  ): Promise<void> {
    const botToken = this.crypto.decrypt({
      ciphertext: connection.botTokenCiphertext,
      iv: connection.botTokenIv,
      tag: connection.botTokenTag,
    });
    await this.slack.openModal(botToken, triggerId, buildCaptureModal(meta));
  }
}
