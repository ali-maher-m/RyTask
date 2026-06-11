import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import type { IntegrationsConfigType } from '../../../common/config/integrations.config';
import { AesGcmCrypto } from '../../../common/crypto/aes-gcm-crypto.adapter';
import { computeGithubSignature } from '../domain/github-signature.policy';
import { GithubLinkQueue } from '../processors/github-link.queue';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';

// In env before AppModule's ConfigModule LOADS (the registerAs factory runs at compile() in
// beforeAll, after this top-level code) — the SLACK_SIGNING_SECRET precedent in the Slack spec.
const TEST_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.GITHUB_TOKEN_ENC_KEY = TEST_KEY;

/**
 * Contract test for the GitHub webhook edge (M5, FR-INT-GH-007 — the Slack events shape). The
 * connection repo + queue are mocked; the live crypto + signature policy run for real. Asserts:
 * a validly-signed push/PR is 202-acked and enqueues EXACTLY one extracted job; a forged
 * signature, unknown or malformed connection id is 401 with NOTHING enqueued; a verified ping /
 * ignored event / revoked connection acks without enqueueing.
 */
const SECRET = 'wh-secret-cafe0123456789';
const crypto = new AesGcmCrypto({
  slack: {},
  github: { tokenEncKey: TEST_KEY },
  mcp: {},
} as IntegrationsConfigType);
const encrypted = crypto.encrypt(SECRET);

const CONNECTION = {
  id: '0193b3a0-0000-7000-8000-0000000000f5',
  organizationId: '0193b3a0-0000-7000-8000-000000000001',
  workspaceId: '0193b3a0-0000-7000-8000-000000000002',
  repoFullName: 'acme/web',
  webhookSecretCiphertext: encrypted.ciphertext,
  webhookSecretIv: encrypted.iv,
  webhookSecretTag: encrypted.tag,
  createdByUserId: '0193b3a0-0000-7000-8000-000000000003',
  revokedAt: null as Date | null,
};

const PUSH_BODY = JSON.stringify({
  ref: 'refs/heads/main',
  repository: { full_name: 'acme/web' },
  commits: [
    {
      id: 'abc1234',
      message: 'Fixes RY-2 stop the loop',
      url: 'https://github.com/acme/web/commit/abc1234',
      author: { username: 'octocat' },
    },
  ],
});

describe('GitHub webhook (contract)', () => {
  let app: INestApplication;
  const enqueue = vi.fn(async () => undefined);
  const findById = vi.fn(async (): Promise<typeof CONNECTION | null> => CONNECTION);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GithubConnectionsRepository)
      .useValue({ findById })
      .overrideProvider(GithubLinkQueue)
      .useValue({ enqueue })
      .compile();
    // `rawBody: true` mirrors main.ts so signature verification sees the exact bytes.
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    enqueue.mockClear();
    findById.mockResolvedValue(CONNECTION);
  });

  const post = (raw: string, headers: Record<string, string>, connectionId = CONNECTION.id) =>
    request(app.getHttpServer())
      .post(`/api/v1/integrations/github/webhook/${connectionId}`)
      .set('content-type', 'application/json')
      .set(headers)
      .send(raw);

  it('202-acks a validly-signed push and enqueues exactly one extracted job', async () => {
    const res = await post(PUSH_BODY, {
      'x-hub-signature-256': computeGithubSignature(SECRET, PUSH_BODY),
      'x-github-event': 'push',
      'x-github-delivery': 'delivery-guid-1',
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, queued: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'push',
        connectionId: CONNECTION.id,
        deliveryId: 'delivery-guid-1',
        repoFullName: 'acme/web',
        commits: [expect.objectContaining({ sha: 'abc1234', authorLogin: 'octocat' })],
      }),
    );
  });

  it('enqueues a linkable pull_request action with the PR slice', async () => {
    const prBody = JSON.stringify({
      action: 'opened',
      repository: { full_name: 'acme/web' },
      pull_request: {
        number: 42,
        title: 'Tidy flow',
        body: 'Closes RY-3',
        html_url: 'https://github.com/acme/web/pull/42',
        user: { login: 'octocat' },
      },
    });
    const res = await post(prBody, {
      'x-hub-signature-256': computeGithubSignature(SECRET, prBody),
      'x-github-event': 'pull_request',
      'x-github-delivery': 'delivery-guid-2',
    });

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'pull_request',
        pr: expect.objectContaining({ number: 42, body: 'Closes RY-3' }),
      }),
    );
  });

  it('rejects a forged signature with 401 and enqueues nothing', async () => {
    const res = await post(PUSH_BODY, {
      'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
      'x-github-event': 'push',
      'x-github-delivery': 'delivery-guid-3',
    });
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects an unknown connection with 401 before any signature work', async () => {
    findById.mockResolvedValue(null);
    const res = await post(PUSH_BODY, {
      'x-hub-signature-256': computeGithubSignature(SECRET, PUSH_BODY),
      'x-github-event': 'push',
    });
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-UUID) connection id with 401 without touching the store', async () => {
    findById.mockClear();
    const res = await post(
      PUSH_BODY,
      {
        'x-hub-signature-256': computeGithubSignature(SECRET, PUSH_BODY),
        'x-github-event': 'push',
      },
      'not-a-uuid',
    );
    expect(res.status).toBe(401);
    expect(findById).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('acks a verified ping / ignored event without enqueueing (queued: false)', async () => {
    const pingBody = JSON.stringify({ zen: 'Design for failure.', hook_id: 1 });
    const res = await post(pingBody, {
      'x-hub-signature-256': computeGithubSignature(SECRET, pingBody),
      'x-github-event': 'ping',
      'x-github-delivery': 'delivery-guid-4',
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, queued: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('acks but does not process for a revoked connection (no orphaned enqueue)', async () => {
    findById.mockResolvedValue({ ...CONNECTION, revokedAt: new Date() });
    const res = await post(PUSH_BODY, {
      'x-hub-signature-256': computeGithubSignature(SECRET, PUSH_BODY),
      'x-github-event': 'push',
      'x-github-delivery': 'delivery-guid-5',
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true, queued: false });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
