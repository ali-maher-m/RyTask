import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type IntegrationsConfigType, integrationsConfig } from '../config/integrations.config';
import type { Crypto, EncryptedSecret } from './crypto.port';

/** AES-256-GCM parameters. A fresh 96-bit IV per encryption (NIST-recommended for GCM). */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * AES-256-GCM implementation of {@link Crypto} (M3, Principle VI). The 256-bit key comes from
 * `SLACK_TOKEN_ENC_KEY` (base64, validated at config load when Slack is configured). When Slack
 * is NOT configured the key is absent and the adapter is **inert** — it throws only if something
 * actually tries to encrypt/decrypt (which only the Slack flow does, and that path is unreachable
 * without Slack config). GCM provides authenticated encryption: a tampered ciphertext/wrong key
 * fails the tag check on `decrypt`.
 */
@Injectable()
export class AesGcmCrypto implements Crypto {
  private readonly key: Buffer | null;

  constructor(@Inject(integrationsConfig.KEY) config: IntegrationsConfigType) {
    // ONE shared integrations key (M5): Slack's name wins when both are set; the GitHub
    // alias keeps GitHub linking usable without any Slack configuration.
    const keyB64 = config.slack.tokenEncKey ?? config.github?.tokenEncKey;
    this.key = keyB64 ? Buffer.from(keyB64, 'base64') : null;
  }

  private requireKey(): Buffer {
    if (!this.key || this.key.length !== KEY_BYTES) {
      throw new Error(
        'Crypto is not configured: set SLACK_TOKEN_ENC_KEY (or GITHUB_TOKEN_ENC_KEY) to a base64-encoded 32-byte key.',
      );
    }
    return this.key;
  }

  encrypt(plaintext: string): EncryptedSecret {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    const key = this.requireKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
