import { type INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { CAPTURE_MODAL_CALLBACK_ID } from '../domain/slack-blocks';
import { computeSlackSignature } from '../domain/slack-signature.policy';
import { SlackCaptureQueue } from '../processors/slack-capture.queue';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';

/**
 * Contract test for the Slack webhook (T046, US2, slack-capture-flow §1/§2). The signing secret is
 * set in env so we can sign a known body; the connection repo + capture queue are mocked. Asserts
 * the live {@link SlackSignatureGuard}: a forged/missing/stale signature is 401'd and enqueues
 * NOTHING; a valid request acks within the 3 s window (ephemeral 200) and enqueues exactly one job.
 * US3 (phase 5) extends this spec with the `/interactivity` route.
 */
const SIGNING_SECRET = 'test-slack-signing-secret';
process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;

const CONNECTION = {
  id: '0193b3a0-0000-7000-8000-0000000000f1',
  organizationId: '0193b3a0-0000-7000-8000-000000000001',
  workspaceId: '0193b3a0-0000-7000-8000-000000000002',
  slackTeamId: 'T_TEST',
  defaultProjectId: '0193b3a0-0000-7000-8000-000000000010',
  installedByUserId: '0193b3a0-0000-7000-8000-000000000003',
  revokedAt: null,
};

const RAW_BODY =
  'team_id=T_TEST&user_id=U_CAPTOR&channel_id=C1&command=%2Ftask&text=Fix+login+bug+%21urgent&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2Fx&trigger_id=trig-1';

describe('Slack events webhook (contract)', () => {
  let app: INestApplication;
  const enqueue = vi.fn(async () => undefined);
  const findByTeamId = vi.fn(async () => CONNECTION as never);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SlackWorkspacesRepository)
      .useValue({ findByTeamId })
      .overrideProvider(SlackCaptureQueue)
      .useValue({ enqueue })
      .compile();
    // `rawBody: true` mirrors main.ts so the signature guard sees the exact bytes.
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1', {
      exclude: [
        'healthz',
        'readyz',
        { path: 'integrations/slack/oauth/callback', method: RequestMethod.GET },
      ],
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  const post = (rawBody: string, ts: string, sig: string) =>
    request(server())
      .post('/api/v1/integrations/slack/commands')
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', ts)
      .set('x-slack-signature', sig)
      .send(rawBody);

  const freshTs = () => String(Math.floor(Date.now() / 1000));

  it('acks a validly-signed slash command (200 ephemeral) and enqueues exactly one job', async () => {
    enqueue.mockClear();
    const ts = freshTs();
    const sig = computeSlackSignature(SIGNING_SECRET, ts, RAW_BODY);

    const res = await post(RAW_BODY, ts, sig);

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('ephemeral');
    expect(typeof res.body.text).toBe('string');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'slash',
        teamId: 'T_TEST',
        slackUserId: 'U_CAPTOR',
        text: 'Fix login bug !urgent',
        triggerId: 'trig-1',
      }),
    );
  });

  it('rejects a forged signature with 401 and enqueues nothing', async () => {
    enqueue.mockClear();
    const res = await post(RAW_BODY, freshTs(), 'v0=deadbeefdeadbeef');
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a missing signature with 401 and enqueues nothing', async () => {
    enqueue.mockClear();
    const res = await request(server())
      .post('/api/v1/integrations/slack/commands')
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', freshTs())
      .send(RAW_BODY);
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a stale timestamp with 401 (replay window) and enqueues nothing', async () => {
    enqueue.mockClear();
    const staleTs = String(Math.floor(Date.now() / 1000) - 10_000);
    const sig = computeSlackSignature(SIGNING_SECRET, staleTs, RAW_BODY);
    const res = await post(RAW_BODY, staleTs, sig);
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  // — US3 interactivity (T059) —

  const interactionBody = (callbackId: string): string => {
    const interaction = {
      type: 'view_submission',
      team: { id: 'T_TEST' },
      user: { id: 'U_CAPTOR' },
      trigger_id: 'trig-modal',
      view: {
        id: 'V123',
        callback_id: callbackId,
        private_metadata: JSON.stringify({ responseUrl: 'https://hooks.slack/x', channelId: 'C1' }),
        state: { values: { rt_title: { value: { value: 'Modal task' } } } },
      },
    };
    return `payload=${encodeURIComponent(JSON.stringify(interaction))}`;
  };

  const postInteractivity = (rawBody: string, ts: string, sig: string) =>
    request(server())
      .post('/api/v1/integrations/slack/interactivity')
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', ts)
      .set('x-slack-signature', sig)
      .send(rawBody);

  it('acks a validly-signed view_submission (200) and enqueues a modal-submit job', async () => {
    enqueue.mockClear();
    const raw = interactionBody(CAPTURE_MODAL_CALLBACK_ID);
    const ts = freshTs();
    const sig = computeSlackSignature(SIGNING_SECRET, ts, raw);

    const res = await postInteractivity(raw, ts, sig);

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'modal_submit',
        teamId: 'T_TEST',
        slackUserId: 'U_CAPTOR',
        triggerId: 'V123',
      }),
    );
  });

  it('rejects a forged interactivity signature with 401 and enqueues nothing', async () => {
    enqueue.mockClear();
    const raw = interactionBody(CAPTURE_MODAL_CALLBACK_ID);
    const res = await postInteractivity(raw, freshTs(), 'v0=forged');
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('ignores a non-capture interaction (acks 200, no enqueue)', async () => {
    enqueue.mockClear();
    const raw = interactionBody('some_other_modal');
    const ts = freshTs();
    const sig = computeSlackSignature(SIGNING_SECRET, ts, raw);
    const res = await postInteractivity(raw, ts, sig);
    expect(res.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
