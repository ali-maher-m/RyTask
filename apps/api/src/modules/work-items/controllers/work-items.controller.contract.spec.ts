import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CreateWorkItemResponse, WorkItem } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { withPrincipal } from '../../../common/testing/with-principal';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { VersionConflictError } from '../repositories/work-items.repository';
import { WorkItemsService } from '../services/work-items.service';

/**
 * Contract test for POST /work-items (T019). The service is mocked, so this asserts the
 * HTTP contract — 201, the `{ data, meta.unresolved }` envelope, and `.strict()` Zod
 * validation (unknown field / missing title+quickAdd → 400). DB behaviour + RBAC are
 * covered by the integration test.
 */
const cannedItem: WorkItem = {
  id: 'wi-1',
  key: 'RY-4',
  number: 4,
  projectId: SEED_PROJECT_ID,
  title: 'A new task',
  description: null,
  statusId: 's1',
  priority: 'NONE',
  assigneeId: null,
  reporterId: SEED_USER_ID,
  parentId: null,
  estimateValue: null,
  startDate: null,
  endDate: null,
  dueDate: null,
  position: null,
  version: 0,
  completedAt: null,
  createdAt: '2026-05-31T12:00:00.000Z',
  updatedAt: '2026-05-31T12:00:00.000Z',
};
const mockService = {
  create: vi.fn(
    async (): Promise<CreateWorkItemResponse> => ({ data: cannedItem, meta: { unresolved: [] } }),
  ),
  update: vi.fn(async (_id: string, body: { version: number }): Promise<{ data: WorkItem }> => {
    if (body.version === 99) {
      throw new VersionConflictError(0); // simulate a stale version → 409
    }
    return { data: { ...cannedItem, title: 'Renamed', version: body.version + 1 } };
  }),
  move: vi.fn(async (_id: string, body: { version: number }): Promise<{ data: WorkItem }> => {
    if (body.version === 99) {
      throw new VersionConflictError(0); // simulate a stale move → 409
    }
    return { data: { ...cannedItem, statusId: 's2', position: 1536, version: body.version + 1 } };
  }),
  list: vi.fn(async () => ({
    data: [cannedItem],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  addSubtask: vi.fn(
    async (
      _id: string,
      body: { title?: string; quickAdd?: string },
    ): Promise<CreateWorkItemResponse> => ({
      data: { ...cannedItem, parentId: ITEM_ID, title: body.title ?? 'sub' },
      meta: { unresolved: [] },
    }),
  ),
  listSubtasks: vi.fn(async () => ({
    data: [{ ...cannedItem, parentId: ITEM_ID, childCount: 0 }],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  get: vi.fn(async (): Promise<{ data: WorkItem }> => ({ data: { ...cannedItem, childCount: 2 } })),
  delete: vi.fn(async (): Promise<void> => undefined),
  restore: vi.fn(async (): Promise<{ data: WorkItem }> => ({ data: cannedItem })),
  listActivity: vi.fn(async () => ({ data: [] })),
  addLabel: vi.fn(async () => ({ labelId: '0193b3a0-0000-7000-8000-0000000000aa' })),
  removeLabel: vi.fn(async (): Promise<void> => undefined),
};

const ITEM_ID = '0193b3a0-0000-7000-8000-000000000020';
const LABEL_ID = '0193b3a0-0000-7000-8000-0000000000aa';

describe('WorkItemsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkItemsService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = () =>
    request(app.getHttpServer())
      .post('/api/v1/work-items')
      .set('authorization', withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, role: 'OWNER' }));

  it('title-only body → 201 with { data, meta.unresolved }', async () => {
    const res = await post().send({ projectId: SEED_PROJECT_ID, title: 'A new task' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe('RY-4');
    expect(res.body.meta.unresolved).toEqual([]);
  });

  it('quickAdd body → 201', async () => {
    const res = await post().send({ projectId: SEED_PROJECT_ID, quickAdd: 'Hello @founder !high' });
    expect(res.status).toBe(201);
  });

  it('unknown field → 400 (strict schema)', async () => {
    const res = await post().send({ projectId: SEED_PROJECT_ID, title: 'x', bogus: true });
    expect(res.status).toBe(400);
  });

  it('neither title nor quickAdd → 400', async () => {
    const res = await post().send({ projectId: SEED_PROJECT_ID });
    expect(res.status).toBe(400);
  });

  const authed = (method: 'patch' | 'delete' | 'post' | 'get', path: string): request.Test =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('authorization', withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, role: 'OWNER' }));

  it('PATCH /work-items/{id} with a valid version → 200 { data }', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({
      version: 0,
      title: 'Renamed',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed');
  });

  it('PATCH /work-items/{id} unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({ version: 0, bogus: true });
    expect(res.status).toBe(400);
  });

  it('PATCH /work-items/{id} missing version → 400', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('PATCH /work-items/{id} stale version → 409', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({ version: 99 });
    expect(res.status).toBe(409);
  });

  it('DELETE /work-items/{id} → 204', async () => {
    const res = await authed('delete', `/work-items/${ITEM_ID}`).send();
    expect(res.status).toBe(204);
  });

  it('POST /work-items/{id}/restore → 200 { data }', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/restore`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('RY-4');
  });

  it('GET /work-items/{id}/activity → 200 { data: [] }', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}/activity`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /work-items/{id}/labels (by name) → 201 { labelId }', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/labels`).send({ name: 'bug' });
    expect(res.status).toBe(201);
    expect(res.body.labelId).toBe(LABEL_ID);
  });

  it('POST /work-items/{id}/labels with empty body → 400', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/labels`).send({});
    expect(res.status).toBe(400);
  });

  it('DELETE /work-items/{id}/labels/{labelId} → 204', async () => {
    const res = await authed('delete', `/work-items/${ITEM_ID}/labels/${LABEL_ID}`).send();
    expect(res.status).toBe(204);
  });

  // ── US3: list / board / get / move ─────────────────────────────────────────────

  it('GET /work-items → 200 { data, pageInfo }', async () => {
    const res = await authed('get', `/work-items?projectId=${SEED_PROJECT_ID}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pageInfo).toMatchObject({ nextCursor: null, hasNextPage: false });
  });

  it('GET /work-items with group=status → 200 (board grouping accepted)', async () => {
    const res = await authed(
      'get',
      `/work-items?projectId=${SEED_PROJECT_ID}&group=status&sort=-priority`,
    ).send();
    expect(res.status).toBe(200);
  });

  it('GET /work-items with an unknown query field → 400 (strict)', async () => {
    const res = await authed('get', '/work-items?bogus=1').send();
    expect(res.status).toBe(400);
  });

  it('GET /work-items/{id} → 200 { data }', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('RY-4');
  });

  it('POST /work-items/{id}/move with a valid version → 200 { data }', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/move`).send({
      version: 0,
      statusId: '0193b3a0-0000-7000-8000-000000000013',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.statusId).toBe('s2');
  });

  it('POST /work-items/{id}/move stale version → 409', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/move`).send({ version: 99 });
    expect(res.status).toBe(409);
  });

  it('POST /work-items/{id}/move unknown field → 400 (strict)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/move`).send({
      version: 0,
      bogus: true,
    });
    expect(res.status).toBe(400);
  });

  // ── US6: sub-tasks + dates + overdue/due-soon smart views ──────────────────────

  it('GET /work-items/{id} surfaces childCount', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.childCount).toBe(2);
  });

  it('GET /work-items/{id}/subtasks → 200 { data, pageInfo }', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}/subtasks`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].parentId).toBe(ITEM_ID);
  });

  it('POST /work-items/{id}/subtasks (title) → 201 with parentId set', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/subtasks`).send({ title: 'Child' });
    expect(res.status).toBe(201);
    expect(res.body.data.parentId).toBe(ITEM_ID);
    expect(res.body.data.title).toBe('Child');
  });

  it('POST /work-items/{id}/subtasks with neither title nor quickAdd → 400', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/subtasks`).send({});
    expect(res.status).toBe(400);
  });

  it('POST /work-items/{id}/subtasks rejects projectId/parentId in body → 400 (strict)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/subtasks`).send({
      title: 'Child',
      projectId: SEED_PROJECT_ID,
    });
    expect(res.status).toBe(400);
  });

  it('PATCH /work-items/{id} accepts the independent date fields', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({
      version: 0,
      dueDate: '2026-08-01',
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    });
    expect(res.status).toBe(200);
  });

  it('PATCH /work-items/{id} rejects a malformed date → 400', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({
      version: 0,
      dueDate: '08/01/2026',
    });
    expect(res.status).toBe(400);
  });

  it('PATCH /work-items/{id} accepts null to clear a date', async () => {
    const res = await authed('patch', `/work-items/${ITEM_ID}`).send({ version: 0, dueDate: null });
    expect(res.status).toBe(200);
  });

  it('GET /work-items?smart=overdue → 200', async () => {
    const res = await authed('get', '/work-items?smart=overdue').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /work-items?smart=due-soon → 200', async () => {
    const res = await authed('get', '/work-items?smart=due-soon').send();
    expect(res.status).toBe(200);
  });
});
