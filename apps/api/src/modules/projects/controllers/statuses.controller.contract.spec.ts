import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Status } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { StatusesService } from '../services/statuses.service';

/**
 * Contract test for the statuses surface (T050). The service is mocked, so this asserts
 * the HTTP contract — routes, the `{ data }` envelopes, `.strict()` Zod validation (400),
 * and the 409 a delete raises when a status still has items. RBAC + DB behaviour are
 * covered by the integration/tenancy tests.
 */
const cannedStatus: Status = {
  id: '0193b3a0-0000-7000-8000-0000000000c1',
  name: 'Blocked',
  category: 'STARTED',
  color: '#EF4444',
  position: 6,
};

const PROJECT_ID = SEED_PROJECT_ID;
const STATUS_ID = '0193b3a0-0000-7000-8000-0000000000c1';
const REASSIGN_ID = '0193b3a0-0000-7000-8000-0000000000c2';

const mockService = {
  list: vi.fn(async () => ({ data: [cannedStatus] })),
  create: vi.fn(async () => ({ data: cannedStatus })),
  update: vi.fn(async () => ({ data: { ...cannedStatus, name: 'Renamed' } })),
  reorder: vi.fn(async () => ({ data: [cannedStatus] })),
  delete: vi.fn(async (_id: string, reassignTo: string | null): Promise<void> => {
    if (!reassignTo) {
      throw new ConflictException('status has work items; provide reassignTo');
    }
  }),
};

describe('StatusesController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StatusesService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'get' | 'post' | 'patch' | 'delete', path: string): request.Test =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('x-user-id', SEED_USER_ID)
      .set('x-organization-id', SEED_ORG_ID)
      .set('x-workspace-id', SEED_WORKSPACE_ID)
      .set('x-org-admin', 'true');

  it('GET /projects/{id}/statuses → 200 { data: Status[] }', async () => {
    const res = await authed('get', `/projects/${PROJECT_ID}/statuses`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].category).toBe('STARTED');
  });

  it('POST /projects/{id}/statuses → 201 { data }', async () => {
    const res = await authed('post', `/projects/${PROJECT_ID}/statuses`).send({
      name: 'Blocked',
      category: 'STARTED',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(STATUS_ID);
  });

  it('POST /projects/{id}/statuses unknown field → 400 (strict)', async () => {
    const res = await authed('post', `/projects/${PROJECT_ID}/statuses`).send({
      name: 'X',
      category: 'STARTED',
      bogus: true,
    });
    expect(res.status).toBe(400);
  });

  it('POST /projects/{id}/statuses invalid category → 400', async () => {
    const res = await authed('post', `/projects/${PROJECT_ID}/statuses`).send({
      name: 'X',
      category: 'DONE',
    });
    expect(res.status).toBe(400);
  });

  it('POST /projects/{id}/statuses/reorder → 200 { data }', async () => {
    const res = await authed('post', `/projects/${PROJECT_ID}/statuses/reorder`).send({
      orderedIds: [STATUS_ID, REASSIGN_ID],
    });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('PATCH /statuses/{id} → 200 { data }', async () => {
    const res = await authed('patch', `/statuses/${STATUS_ID}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });

  it('PATCH /statuses/{id} unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/statuses/${STATUS_ID}`).send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it('DELETE /statuses/{id}?reassignTo=… → 204', async () => {
    const res = await authed('delete', `/statuses/${STATUS_ID}?reassignTo=${REASSIGN_ID}`).send();
    expect(res.status).toBe(204);
  });

  it('DELETE /statuses/{id} with items but no reassignTo → 409', async () => {
    const res = await authed('delete', `/statuses/${STATUS_ID}`).send();
    expect(res.status).toBe(409);
  });
});
