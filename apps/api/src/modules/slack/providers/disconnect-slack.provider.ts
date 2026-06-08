import { Inject, Injectable } from '@nestjs/common';
import { CRYPTO, type Crypto } from '../../../common/crypto/crypto.port';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { SLACK, type SlackPort } from '../../../common/ports/slack.port';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * Disconnect the org's Slack connection (US1, FR-SLK-003). Revokes the bot token at Slack
 * (best-effort — a failed remote revoke still stops capture locally) and soft-revokes the row
 * (`revoked_at`), after which queued/future captures resolving this connection are no-ops (no
 * orphaned writes, Edge Cases). Idempotent: no connection / already revoked → nothing to do.
 */
@Injectable()
export class DisconnectSlackProvider {
  constructor(
    @Inject(SLACK) private readonly slack: SlackPort,
    @Inject(CRYPTO) private readonly crypto: Crypto,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly workspaces: SlackWorkspacesRepository,
  ) {}

  async disconnect(): Promise<void> {
    const connection = await this.workspaces.findForOrg();
    if (!connection || connection.revokedAt) {
      return; // idempotent no-op
    }
    try {
      const botToken = this.crypto.decrypt({
        ciphertext: connection.botTokenCiphertext,
        iv: connection.botTokenIv,
        tag: connection.botTokenTag,
      });
      await this.slack.revokeToken(botToken);
    } catch {
      // The local soft-revoke below is the source of truth (capture stops regardless).
    }
    await this.workspaces.setRevoked(connection.id, this.clock.now());
  }
}
