import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CRYPTO, type Crypto } from '../../../common/crypto/crypto.port';
import { Public } from '../../../common/rbac/decorators';
import { verifyGithubSignature } from '../domain/github-signature.policy';
import type {
  GithubCommitRef,
  GithubLinkJob,
  GithubPrRef,
} from '../processors/github-link.processor';
import { GithubLinkQueue } from '../processors/github-link.queue';
import {
  type GithubConnectionRow,
  GithubConnectionsRepository,
} from '../repositories/github-connections.repository';

/** PR actions that can change the title/body text we link from (the rest carry nothing new). */
const LINKABLE_PR_ACTIONS = new Set(['opened', 'edited', 'reopened', 'ready_for_review']);

/** Cap commits extracted per push — a giant force-push must not fan out unbounded. */
const MAX_COMMITS_PER_PUSH = 50;

/** Webhook ack body — `queued: false` means verified-but-ignored (ping, revoked, no-op event). */
interface GithubAck {
  ok: true;
  queued: boolean;
}

/** Loosely-typed slice of the GitHub payloads we read (signature-verified before any use). */
interface GithubPayload {
  repository?: { full_name?: string };
  commits?: Array<{
    id?: string;
    message?: string;
    url?: string;
    author?: { username?: string; name?: string };
  }>;
  action?: string;
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    html_url?: string;
    user?: { login?: string };
  };
}

/**
 * GitHub webhook edge (M5, FR-INT-GH-006/007 — the Slack events-controller shape). `@Public`
 * (GitHub carries no RyTask bearer token); authentication is the per-connection HMAC signature
 * over the RAW bytes. The handler does the MINIMUM synchronous work: resolve the URL's connection
 * id (global lookup), decrypt its secret, verify `X-Hub-Signature-256`, extract the small
 * linkable slice, enqueue with a deterministic delivery-derived job id — the heavy parse/link
 * runs on the worker. A forged, unknown-connection, or undecryptable request is 401'd having
 * written and enqueued NOTHING.
 */
@Controller('integrations/github')
@Public()
export class GithubWebhookController {
  constructor(
    private readonly connections: GithubConnectionsRepository,
    private readonly queue: GithubLinkQueue,
    @Inject(CRYPTO) private readonly crypto: Crypto,
  ) {}

  @Post('webhook/:connectionId')
  @HttpCode(202)
  async receive(
    @Param('connectionId') connectionId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') delivery: string | undefined,
    @Body() body: GithubPayload,
  ): Promise<GithubAck> {
    // A non-UUID path segment can't be a connection — refuse before it reaches the DB driver.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(connectionId)) {
      throw new UnauthorizedException('unknown GitHub connection');
    }
    const connection = await this.connections.findById(connectionId);
    if (!connection) {
      throw new UnauthorizedException('unknown GitHub connection');
    }

    let secret: string;
    try {
      secret = this.crypto.decrypt({
        ciphertext: connection.webhookSecretCiphertext,
        iv: connection.webhookSecretIv,
        tag: connection.webhookSecretTag,
      });
    } catch {
      // No/changed encryption key: the stored secret can't be recovered → nothing can verify.
      throw new UnauthorizedException('GitHub linking is not configured');
    }

    const rawBody = req.rawBody?.toString('utf8') ?? '';
    if (!verifyGithubSignature({ rawBody, signature, secret })) {
      throw new UnauthorizedException('invalid GitHub signature');
    }

    // Verified beyond this point. A revoked connection acknowledges but processes nothing.
    if (connection.revokedAt) {
      return { ok: true, queued: false };
    }

    const job = buildLinkJob(connection, event, delivery ?? hashDelivery(rawBody), body);
    if (!job) {
      return { ok: true, queued: false }; // ping / ignored event / no linkable content
    }
    await this.queue.enqueue(job);
    return { ok: true, queued: true };
  }
}

/** Deterministic fallback delivery id when the header is absent (still replay-stable). */
function hashDelivery(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('hex').slice(0, 32);
}

/** Extract the minimal linkable slice of a verified delivery, or null when there is none. */
function buildLinkJob(
  connection: GithubConnectionRow,
  event: string | undefined,
  deliveryId: string,
  body: GithubPayload,
): GithubLinkJob | null {
  const repoFullName = body.repository?.full_name ?? '';
  if (event === 'push' && Array.isArray(body.commits)) {
    const commits: GithubCommitRef[] = body.commits
      .slice(0, MAX_COMMITS_PER_PUSH)
      .filter((c) => typeof c.id === 'string' && typeof c.message === 'string')
      .map((c) => ({
        sha: c.id as string,
        message: c.message as string,
        url: c.url ?? '',
        authorLogin: c.author?.username ?? c.author?.name ?? null,
      }));
    if (commits.length === 0) {
      return null;
    }
    return { kind: 'push', connectionId: connection.id, deliveryId, repoFullName, commits };
  }
  if (
    event === 'pull_request' &&
    body.action &&
    LINKABLE_PR_ACTIONS.has(body.action) &&
    body.pull_request &&
    typeof body.pull_request.number === 'number' &&
    typeof body.pull_request.title === 'string'
  ) {
    const pr: GithubPrRef = {
      number: body.pull_request.number,
      title: body.pull_request.title,
      body: body.pull_request.body ?? null,
      url: body.pull_request.html_url ?? '',
      authorLogin: body.pull_request.user?.login ?? null,
    };
    return { kind: 'pull_request', connectionId: connection.id, deliveryId, repoFullName, pr };
  }
  return null; // ping + everything else: verified, acknowledged, ignored
}
