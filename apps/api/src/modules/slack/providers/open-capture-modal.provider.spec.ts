import { describe, expect, it, vi } from 'vitest';
import type { IntegrationsConfigType } from '../../../common/config/integrations.config';
import { AesGcmCrypto } from '../../../common/crypto/aes-gcm-crypto.adapter';
import type { SlackPort } from '../../../common/ports/slack.port';
import {
  CAPTURE_MODAL_CALLBACK_ID,
  type CaptureModalContext,
  type SlackView,
} from '../domain/slack-blocks';
import type { SlackWorkspaceRow } from '../repositories/slack-workspaces.repository';
import { OpenCaptureModalProvider } from './open-capture-modal.provider';

/**
 * Unit test (no DB). Proves the modal opener decrypts the per-install bot token (Crypto port)
 * and calls `views.open` with the trigger id + a pure capture view — and that the plaintext
 * token never appears in the view it builds (Principle VI).
 */
const crypto = new AesGcmCrypto({
  slack: { tokenEncKey: Buffer.alloc(32, 7).toString('base64'), configured: true },
  mcp: {},
} as IntegrationsConfigType);

const BOT_TOKEN = 'xoxb-modal-secret-789';

const connectionWithToken = (): SlackWorkspaceRow => {
  const enc = crypto.encrypt(BOT_TOKEN);
  return {
    botTokenCiphertext: enc.ciphertext,
    botTokenIv: enc.iv,
    botTokenTag: enc.tag,
  } as unknown as SlackWorkspaceRow;
};

describe('OpenCaptureModalProvider', () => {
  it('decrypts the bot token and opens the capture modal with the trigger id', async () => {
    const openModal = vi.fn(async () => undefined);
    const slack = { openModal } as unknown as SlackPort;
    const provider = new OpenCaptureModalProvider(slack, crypto);
    const meta: CaptureModalContext = { responseUrl: 'https://hooks.slack/r/1', channelId: 'C1' };

    await provider.open(connectionWithToken(), 'trigger-123', meta);

    expect(openModal).toHaveBeenCalledTimes(1);
    const [token, triggerId, view] = openModal.mock.calls[0] as [string, string, SlackView];
    expect(token).toBe(BOT_TOKEN); // decrypted, not the ciphertext
    expect(triggerId).toBe('trigger-123');
    expect(view.callback_id).toBe(CAPTURE_MODAL_CALLBACK_ID);
    // The reply target is carried in private_metadata so the worker can confirm later.
    expect(view.private_metadata).toContain('C1');
    // No plaintext secret leaks into the opaque view.
    expect(JSON.stringify(view)).not.toContain(BOT_TOKEN);
  });
});
