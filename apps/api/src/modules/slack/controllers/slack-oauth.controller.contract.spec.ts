import { BadRequestException, type INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { SLACK_SERVICE } from '../slack.contract';

/**
 * Contract test for the Slack OAuth surface (T029, US1, slack-rest.md §A). The service is mocked,
 * so this asserts the HTTP contract + the live RbacGuard: install is admin-gated
 * (`org:settings:write`); the callback (`@Public`, served at the ROOT) validates `state`, and a
 * declined/interrupted consent records NO partial connection (the service is never called).
 */
const CONSENT_URL = 'https://slack.com/oauth/v2/authorize?client_id=x&state=signed';

const tokenFor = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

describe('Slack OAuth (contract)', () => {
  let app: INestApplication;
  const mockSlack = {
    beginInstall: vi.fn(async () => ({ url: CONSENT_URL })),
    completeInstall: vi.fn(async () => undefined),
    getConnection: vi.fn(),
    updateConnection: vi.fn(),
    disconnect: vi.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SLACK_SERVICE)
      .useValue(mockSlack)
      .compile();
    app = moduleRef.createNestApplication();
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

  it('GET /integrations/slack/install is admin-gated (OWNER 200 + url, MEMBER 403)', async () => {
    const ok = await request(server())
      .get('/api/v1/integrations/slack/install')
      .set('authorization', tokenFor('OWNER'));
    expect(ok.status).toBe(200);
    expect(ok.body.url).toBe(CONSENT_URL);

    const denied = await request(server())
      .get('/api/v1/integrations/slack/install')
      .set('authorization', tokenFor('MEMBER'));
    expect(denied.status).toBe(403);
  });

  it('rejects an unauthenticated install (401)', async () => {
    const res = await request(server()).get('/api/v1/integrations/slack/install');
    expect(res.status).toBe(401);
  });

  it('callback completes the install and redirects to ?connected=1', async () => {
    mockSlack.completeInstall.mockClear();
    const res = await request(server())
      .get('/integrations/slack/oauth/callback?code=the-code&state=the-state')
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/settings/integrations?connected=1');
    expect(mockSlack.completeInstall).toHaveBeenCalledWith({
      code: 'the-code',
      state: 'the-state',
    });
  });

  it('declined consent records NO partial connection (?error, service not called)', async () => {
    mockSlack.completeInstall.mockClear();
    const res = await request(server())
      .get('/integrations/slack/oauth/callback?error=access_denied')
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=access_denied');
    expect(mockSlack.completeInstall).not.toHaveBeenCalled();
  });

  it('an invalid state redirects to ?error and creates nothing', async () => {
    mockSlack.completeInstall.mockClear();
    mockSlack.completeInstall.mockRejectedValueOnce(new BadRequestException('invalid state'));
    const res = await request(server())
      .get('/integrations/slack/oauth/callback?code=c&state=forged')
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });
});
