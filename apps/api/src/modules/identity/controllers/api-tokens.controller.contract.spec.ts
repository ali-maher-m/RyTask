import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ApiTokenDto, ApiTokenSecret } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { ApiTokensProvider } from '../providers/api-tokens.provider';

/**
 * Contract test for the PAT surface (T093, US7). The provider is mocked, so this asserts the
 * HTTP contract — token-required routes (AuthGuard → 401 without one), 201 mint (secret
 * shown once), 200 list, 204 revoke, and validation (400). Every role holds `tokens:*`, so
 * the now-live RbacGuard admits the seeded OWNER token.
 */
const cannedDto: ApiTokenDto = {
  id: 'tok-1',
  name: 'CI',
  type: 'PAT',
  scopes: ['work:read'],
  lastUsedAt: null,
  expiresAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
};
const cannedSecret: ApiTokenSecret = { ...cannedDto, secret: 'rytask_pat_shown_once' };

const ownerToken = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('ApiTokensController (contract)', () => {
  let app: INestApplication;
  const mockProvider = {
    list: vi.fn(async () => [cannedDto]),
    issue: vi.fn(async () => cannedSecret),
    revoke: vi.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ApiTokensProvider)
      .useValue(mockProvider)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api-tokens without a token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/api-tokens');
    expect(res.status).toBe(401);
  });

  it('GET /api-tokens with a token → 200 array (no secret)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/api-tokens')
      .set('authorization', ownerToken());
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe('tok-1');
    expect(res.body[0].secret).toBeUndefined();
  });

  it('POST /api-tokens → 201 with the secret shown once', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/api-tokens')
      .set('authorization', ownerToken())
      .send({ name: 'CI', type: 'PAT', scopes: ['work:read'] });
    expect(res.status).toBe(201);
    expect(res.body.secret).toBe('rytask_pat_shown_once');
  });

  it('POST /api-tokens bad body → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/api-tokens')
      .set('authorization', ownerToken())
      .send({ type: 'NOPE' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api-tokens/{id} → 204', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/api-tokens/tok-1')
      .set('authorization', ownerToken());
    expect(res.status).toBe(204);
  });
});
