import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Organization } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { OrgsService } from '../services/orgs.service';

/**
 * Contract test for the org read surface — `GET /orgs/current` (FR-TEN-004, US1 AC4). The service
 * is mocked, so this asserts the HTTP contract: `org:read` (held by every role) gates the read, no
 * token → 401. The write routes (PATCH/DELETE/transfer) are covered by
 * `member-admin.controller.contract.spec.ts`.
 */
const cannedOrg: Organization = {
  id: SEED_ORG_ID,
  name: 'Acme',
  slug: 'acme',
  settings: { timezone: 'Europe/Berlin' },
};

describe('OrgsController read (contract)', () => {
  let app: INestApplication;
  const mockService = { current: vi.fn(async () => cannedOrg) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrgsService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /orgs/current without a token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/orgs/current');
    expect(res.status).toBe(401);
  });

  it('GET /orgs/current with a token → 200 org', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orgs/current')
      .set('authorization', withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID }));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SEED_ORG_ID);
    expect(res.body.settings.timezone).toBe('Europe/Berlin');
  });

  it('`org:read` is held by every role (GUEST → 200)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orgs/current')
      .set(
        'authorization',
        withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, role: 'GUEST' }),
      );
    expect(res.status).toBe(200);
  });
});
