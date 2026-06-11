import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateGithubConnectionResponse, GithubConnectionDto, Role } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { ConnectGithubProvider } from '../providers/connect-github.provider';
import { DisconnectGithubProvider } from '../providers/disconnect-github.provider';
import { ListGithubConnectionsProvider } from '../providers/list-github-connections.provider';

/**
 * Contract test for the GitHub admin surface (M5 — the Slack admin shape). Providers are mocked,
 * so this asserts the HTTP contract + the live RbacGuard: listing is visible to ANY member
 * (`org:read`); connect/disconnect require an admin (`org:settings:write` → OWNER/ADMIN, else
 * 403); unauthenticated → 401; a malformed repo name → 400 (zod `.strict`).
 */
const connection: GithubConnectionDto = {
  id: '0193b3a0-0000-7000-8000-0000000000f5',
  repoFullName: 'acme/web',
  connectedAt: '2026-06-11T12:00:00.000Z',
  revokedAt: null,
  webhookPath: '/api/v1/integrations/github/webhook/0193b3a0-0000-7000-8000-0000000000f5',
};

const created: CreateGithubConnectionResponse = {
  data: connection,
  webhookSecret: 'a'.repeat(48),
};

const tokenFor = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

describe('GitHub admin (contract)', () => {
  let app: INestApplication;
  const connect = vi.fn(async () => created);
  const disconnect = vi.fn(async () => undefined);
  const list = vi.fn(async () => ({ data: [connection] }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConnectGithubProvider)
      .useValue({ connect })
      .overrideProvider(DisconnectGithubProvider)
      .useValue({ disconnect })
      .overrideProvider(ListGithubConnectionsProvider)
      .useValue({ list })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('GET /integrations/github is visible to any member (MEMBER 200) and lists connections', async () => {
    const res = await request(server())
      .get('/api/v1/integrations/github')
      .set('authorization', tokenFor('MEMBER'));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].repoFullName).toBe('acme/web');
    expect(JSON.stringify(res.body)).not.toContain('webhookSecret');
  });

  it('GET rejects the unauthenticated (401)', async () => {
    expect((await request(server()).get('/api/v1/integrations/github')).status).toBe(401);
  });

  it('POST /integrations/github is admin-only and returns the secret exactly once (ADMIN 201)', async () => {
    const ok = await request(server())
      .post('/api/v1/integrations/github')
      .set('authorization', tokenFor('ADMIN'))
      .send({ repoFullName: 'acme/web' });
    expect(ok.status).toBe(201);
    expect(ok.body.webhookSecret).toHaveLength(48);
    expect(ok.body.data.webhookPath).toContain('/integrations/github/webhook/');
    expect(connect).toHaveBeenCalledWith({ repoFullName: 'acme/web' });
  });

  it('POST is denied for MEMBER and VIEWER (403)', async () => {
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const denied = await request(server())
        .post('/api/v1/integrations/github')
        .set('authorization', tokenFor(role))
        .send({ repoFullName: 'acme/web' });
      expect(denied.status).toBe(403);
    }
  });

  it('POST rejects a malformed repo name with 400 (expected owner/repo)', async () => {
    const bad = await request(server())
      .post('/api/v1/integrations/github')
      .set('authorization', tokenFor('OWNER'))
      .send({ repoFullName: 'not a repo' });
    expect(bad.status).toBe(400);
  });

  it('DELETE /integrations/github/{id} is admin-only (OWNER 204, MEMBER 403)', async () => {
    const ok = await request(server())
      .delete(`/api/v1/integrations/github/${connection.id}`)
      .set('authorization', tokenFor('OWNER'));
    expect(ok.status).toBe(204);
    expect(disconnect).toHaveBeenCalledWith(connection.id);

    const denied = await request(server())
      .delete(`/api/v1/integrations/github/${connection.id}`)
      .set('authorization', tokenFor('MEMBER'));
    expect(denied.status).toBe(403);
  });
});
