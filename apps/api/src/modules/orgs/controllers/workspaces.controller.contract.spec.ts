import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Workspace } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { WorkspacesService } from '../services/workspaces.service';

/**
 * Contract test for the workspaces read surface (FR-TEN-002). The service is mocked, so this
 * asserts the HTTP contract: `workspace:read` (held by every role) gates the list + get, no token
 * → 401, and a non-UUID id → 400 via `ParseUUIDPipe`.
 */
const cannedWorkspace: Workspace = { id: SEED_WORKSPACE_ID, name: 'General', slug: 'general' };

const anyToken = (): string =>
  withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, role: 'VIEWER' });

describe('WorkspacesController (contract)', () => {
  let app: INestApplication;
  const mockService = {
    list: vi.fn(async () => [cannedWorkspace]),
    get: vi.fn(async () => cannedWorkspace),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkspacesService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /workspaces without a token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/workspaces');
    expect(res.status).toBe(401);
  });

  it('GET /workspaces with a token → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('authorization', anyToken());
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(SEED_WORKSPACE_ID);
  });

  it('GET /workspaces/{id} with a token → 200', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${SEED_WORKSPACE_ID}`)
      .set('authorization', anyToken());
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('general');
  });

  it('GET /workspaces/{id} with a non-UUID id → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/workspaces/not-a-uuid')
      .set('authorization', anyToken());
    expect(res.status).toBe(400);
  });
});
