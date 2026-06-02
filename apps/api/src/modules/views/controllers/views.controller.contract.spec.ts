import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { View } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { WorkItemsService } from '../../work-items/services/work-items.service';
import { ViewsService } from '../services/views.service';

/**
 * Contract test for the saved-views surface + the filter/smart query params on
 * GET /work-items (T080). Both services are mocked, so this asserts the HTTP contract:
 * routes, `{ data }` envelopes, `.strict()` Zod validation (400), and that the work-items
 * list controller forwards `smart`/`filter`/`sort` through to the service. RBAC + DB
 * behaviour are covered by the integration/tenancy tests.
 */
const VIEW_ID = '0193b3a0-0000-7000-8000-0000000a0001';
const cannedView: View = {
  id: VIEW_ID,
  ownerId: SEED_USER_ID,
  projectId: SEED_PROJECT_ID,
  name: 'Team backlog',
  kind: 'LIST',
  scope: 'SHARED',
  filters: { field: 'priority', operator: 'eq', value: 'URGENT' },
  grouping: null,
  sort: [{ field: 'priority', dir: 'desc' }],
  layout: null,
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
};

const mockViews = {
  list: vi.fn(async () => ({ data: [cannedView] })),
  save: vi.fn(async () => ({ data: cannedView })),
  update: vi.fn(async () => ({ data: { ...cannedView, name: 'Renamed' } })),
  delete: vi.fn(async () => undefined),
};

const mockWorkItems = {
  list: vi.fn(async () => ({
    data: [],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
};

describe('ViewsController + work-items query params (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ViewsService)
      .useValue(mockViews)
      .overrideProvider(WorkItemsService)
      .useValue(mockWorkItems)
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
      .set(
        'authorization',
        withPrincipal({
          userId: SEED_USER_ID,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          role: 'OWNER',
        }),
      );

  it('GET /views → 200 { data: View[] }', async () => {
    const res = await authed('get', `/views?projectId=${SEED_PROJECT_ID}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].scope).toBe('SHARED');
  });

  it('POST /views → 201 { data: View }', async () => {
    const res = await authed('post', '/views').send({
      name: 'Team backlog',
      kind: 'LIST',
      scope: 'SHARED',
      projectId: SEED_PROJECT_ID,
      filters: { field: 'priority', operator: 'eq', value: 'URGENT' },
      sort: [{ field: 'priority', dir: 'desc' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(VIEW_ID);
  });

  it('POST /views missing required `kind` → 400', async () => {
    const res = await authed('post', '/views').send({ name: 'No kind' });
    expect(res.status).toBe(400);
  });

  it('POST /views unknown field → 400 (strict)', async () => {
    const res = await authed('post', '/views').send({ name: 'X', kind: 'LIST', bogus: true });
    expect(res.status).toBe(400);
  });

  it('POST /views invalid kind enum → 400', async () => {
    const res = await authed('post', '/views').send({ name: 'X', kind: 'KANBAN' });
    expect(res.status).toBe(400);
  });

  it('PATCH /views/{id} → 200 { data }', async () => {
    const res = await authed('patch', `/views/${VIEW_ID}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });

  it('PATCH /views/{id} unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/views/${VIEW_ID}`).send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it('DELETE /views/{id} → 204', async () => {
    const res = await authed('delete', `/views/${VIEW_ID}`).send();
    expect(res.status).toBe(204);
  });

  it('GET /work-items?smart=overdue forwards the smart view to the service', async () => {
    mockWorkItems.list.mockClear();
    const res = await authed('get', '/work-items?smart=overdue').send();
    expect(res.status).toBe(200);
    expect(mockWorkItems.list).toHaveBeenCalledWith(expect.objectContaining({ smart: 'overdue' }));
  });

  it('GET /work-items?filter=…&sort=… forwards both params to the service', async () => {
    mockWorkItems.list.mockClear();
    const filter = Buffer.from(
      JSON.stringify({ field: 'priority', operator: 'eq', value: 'URGENT' }),
      'utf8',
    ).toString('base64');
    const res = await authed('get', `/work-items?filter=${filter}&sort=-priority`).send();
    expect(res.status).toBe(200);
    expect(mockWorkItems.list).toHaveBeenCalledWith(
      expect.objectContaining({ filter, sort: '-priority' }),
    );
  });

  it('GET /work-items?smart=bogus → 400 (invalid enum)', async () => {
    const res = await authed('get', '/work-items?smart=bogus').send();
    expect(res.status).toBe(400);
  });
});
