import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role, SlackConnectionDto, SlackUserMappingDto } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { SLACK_SERVICE } from '../slack.contract';

/**
 * Contract test for the Slack admin surface (T030, US1, slack-rest.md §C). The service is mocked,
 * so this asserts the HTTP contract + the live RbacGuard: status is visible to ANY member
 * (`org:read`); `PATCH`/`DELETE` require an admin (`org:settings:write` → OWNER/ADMIN, else 403);
 * unauthenticated → 401; bad body → 400. US5 extends this spec with the user-mapping routes.
 */
const connected: SlackConnectionDto = {
  status: 'connected',
  team: { id: 'T123', name: 'Acme' },
  connectedAt: '2026-06-06T12:00:00.000Z',
  defaultProjectId: null,
};

const mapping: SlackUserMappingDto = {
  slackUserId: 'U_GHOST',
  slackUserName: 'Ghost',
  slackUserEmail: 'ghost@example.com',
  mappedUserId: SEED_USER_ID,
  mappedManually: true,
};

const tokenFor = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

describe('Slack admin (contract)', () => {
  let app: INestApplication;
  const mockSlack = {
    beginInstall: vi.fn(),
    completeInstall: vi.fn(),
    getConnection: vi.fn(async () => connected),
    updateConnection: vi.fn(async () => connected),
    disconnect: vi.fn(async () => undefined),
    listSlackUsers: vi.fn(async () => [mapping]),
    mapSlackUser: vi.fn(async () => mapping),
    unmapSlackUser: vi.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SLACK_SERVICE)
      .useValue(mockSlack)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('GET /integrations/slack is visible to any member (MEMBER 200, GUEST 200)', async () => {
    const member = await request(server())
      .get('/api/v1/integrations/slack')
      .set('authorization', tokenFor('MEMBER'));
    expect(member.status).toBe(200);
    expect(member.body.status).toBe('connected');
    expect(member.body.team.name).toBe('Acme');

    const guest = await request(server())
      .get('/api/v1/integrations/slack')
      .set('authorization', tokenFor('GUEST'));
    expect(guest.status).toBe(200);
  });

  it('GET /integrations/slack rejects the unauthenticated (401)', async () => {
    expect((await request(server()).get('/api/v1/integrations/slack')).status).toBe(401);
  });

  it('PATCH /integrations/slack is admin-only (ADMIN 200, MEMBER 403)', async () => {
    const ok = await request(server())
      .patch('/api/v1/integrations/slack')
      .set('authorization', tokenFor('ADMIN'))
      .send({ defaultProjectId: null });
    expect(ok.status).toBe(200);

    const denied = await request(server())
      .patch('/api/v1/integrations/slack')
      .set('authorization', tokenFor('MEMBER'))
      .send({ defaultProjectId: null });
    expect(denied.status).toBe(403);
  });

  it('PATCH /integrations/slack rejects an unknown field (400)', async () => {
    const res = await request(server())
      .patch('/api/v1/integrations/slack')
      .set('authorization', tokenFor('OWNER'))
      .send({ nope: true });
    expect(res.status).toBe(400);
  });

  it('DELETE /integrations/slack is admin-only (ADMIN 204, MEMBER 403)', async () => {
    const ok = await request(server())
      .delete('/api/v1/integrations/slack')
      .set('authorization', tokenFor('ADMIN'));
    expect(ok.status).toBe(204);

    const denied = await request(server())
      .delete('/api/v1/integrations/slack')
      .set('authorization', tokenFor('MEMBER'));
    expect(denied.status).toBe(403);
  });

  // ── US5 — user mapping (slack-rest.md §C): admin-only, tenant-scoped ──────────────────────────

  it('GET /integrations/slack/users is admin-only (ADMIN 200, MEMBER 403)', async () => {
    const ok = await request(server())
      .get('/api/v1/integrations/slack/users')
      .set('authorization', tokenFor('ADMIN'));
    expect(ok.status).toBe(200);
    expect(ok.body[0].slackUserId).toBe('U_GHOST');

    const denied = await request(server())
      .get('/api/v1/integrations/slack/users')
      .set('authorization', tokenFor('MEMBER'));
    expect(denied.status).toBe(403);
  });

  it('POST …/users/{id}/map links a RyTask user (admin only; bad body 400)', async () => {
    const ok = await request(server())
      .post('/api/v1/integrations/slack/users/U_GHOST/map')
      .set('authorization', tokenFor('ADMIN'))
      .send({ userId: SEED_USER_ID });
    expect(ok.status).toBe(201);
    expect(ok.body.mappedManually).toBe(true);

    const denied = await request(server())
      .post('/api/v1/integrations/slack/users/U_GHOST/map')
      .set('authorization', tokenFor('MEMBER'))
      .send({ userId: SEED_USER_ID });
    expect(denied.status).toBe(403);

    const bad = await request(server())
      .post('/api/v1/integrations/slack/users/U_GHOST/map')
      .set('authorization', tokenFor('OWNER'))
      .send({ userId: 'not-a-uuid' });
    expect(bad.status).toBe(400);
  });

  it('DELETE …/users/{id}/map unlinks (admin 204, member 403)', async () => {
    const ok = await request(server())
      .delete('/api/v1/integrations/slack/users/U_GHOST/map')
      .set('authorization', tokenFor('ADMIN'));
    expect(ok.status).toBe(204);

    const denied = await request(server())
      .delete('/api/v1/integrations/slack/users/U_GHOST/map')
      .set('authorization', tokenFor('MEMBER'));
    expect(denied.status).toBe(403);
  });
});
