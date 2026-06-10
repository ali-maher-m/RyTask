import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { WhoAmI } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { WhoamiProvider } from '../providers/whoami.provider';

/**
 * Contract test for `GET /auth/whoami` (FR-INT-MCP-001). The provider is mocked, so this asserts
 * the HTTP contract: the route needs a verified principal (`self`, held by every role) — no token
 * → 401, any token → 200 with the principal payload.
 */
const cannedWhoAmI: WhoAmI = {
  user: { id: SEED_USER_ID, email: 'founder@rytask.local', name: 'Founder', emailVerified: true },
  organizationId: SEED_ORG_ID,
  activeWorkspaceId: SEED_WORKSPACE_ID,
  role: 'OWNER',
  scopes: [],
  workspaces: [{ id: SEED_WORKSPACE_ID, name: 'General', slug: 'general' }],
};

describe('WhoamiController (contract)', () => {
  let app: INestApplication;
  const mockWhoami = { build: vi.fn(async () => cannedWhoAmI) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhoamiProvider)
      .useValue(mockWhoami)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/whoami without a token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/whoami');
    expect(res.status).toBe(401);
  });

  it('GET /auth/whoami with a token → 200 principal payload', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/whoami')
      .set('authorization', withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID }));
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('founder@rytask.local');
    expect(res.body.role).toBe('OWNER');
    expect(res.body.workspaces[0].id).toBe(SEED_WORKSPACE_ID);
  });

  it('`self` is held by every role (GUEST → 200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/whoami')
      .set(
        'authorization',
        withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, role: 'GUEST' }),
      );
    expect(res.status).toBe(200);
  });
});
