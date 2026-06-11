import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  CreateGithubConnectionInput,
  CreateGithubConnectionResponse,
} from '@rytask/contracts';
import { CRYPTO, type Crypto, type EncryptedSecret } from '../../../common/crypto/crypto.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { toGithubConnectionDto } from '../domain/github-connection.mapper';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';

/** Webhook-secret entropy: 24 random bytes → 48 hex chars (GitHub accepts any string). */
const SECRET_BYTES = 24;

/**
 * Connect a repository (M5, US1). RyTask MINTS the webhook secret — the admin never invents
 * one — encrypts it at rest (AES-256-GCM via the `Crypto` port, the Slack bot-token precedent)
 * and returns the plaintext exactly ONCE in the create response. Reconnecting the same
 * `owner/repo` rotates the secret on the existing row and clears a prior revoke.
 */
@Injectable()
export class ConnectGithubProvider {
  constructor(
    @Inject(CRYPTO) private readonly crypto: Crypto,
    private readonly connections: GithubConnectionsRepository,
    private readonly tenant: TenantContextService,
  ) {}

  async connect(input: CreateGithubConnectionInput): Promise<CreateGithubConnectionResponse> {
    const ctx = this.tenant.get();
    if (!ctx.workspaceId || !ctx.userId) {
      throw new BadRequestException('No active workspace for this request.');
    }

    const webhookSecret = randomBytes(SECRET_BYTES).toString('hex');
    let encrypted: EncryptedSecret;
    try {
      encrypted = this.crypto.encrypt(webhookSecret);
    } catch {
      // Inert-by-default (Principle VII): without a key the feature refuses kindly, app still runs.
      throw new BadRequestException(
        'GitHub linking needs an encryption key. Set GITHUB_TOKEN_ENC_KEY (or SLACK_TOKEN_ENC_KEY) to a base64-encoded 32-byte key — generate one with `openssl rand -base64 32` — and restart.',
      );
    }

    const row = await this.connections.upsert({
      workspaceId: ctx.workspaceId,
      repoFullName: input.repoFullName,
      webhookSecretCiphertext: encrypted.ciphertext,
      webhookSecretIv: encrypted.iv,
      webhookSecretTag: encrypted.tag,
      createdByUserId: ctx.userId,
    });

    return { data: toGithubConnectionDto(row), webhookSecret };
  }
}
