import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Project, ProjectMember } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { WorkItemsService } from '../../work-items/services/work-items.service';
import { ProjectsService } from '../services/projects.service';

/**
 * Contract test for the projects surface (T066). The services are mocked, so this asserts
 * the HTTP contract — routes, `{ data }` / `{ data, pageInfo }` envelopes, `.strict()` Zod
 * validation (400), and the non-member 403 (FR-PROJ-002). RBAC + DB behaviour are covered by
 * the integration/tenancy tests. `GET /work-items?smart=my-work` is asserted via a mocked
 * WorkItemsService.
 */
const cannedProject: Project = {
  id: SEED_PROJECT_ID,
  name: 'Marketing',
  keyPrefix: 'MKT',
  description: null,
  icon: null,
  color: '#6366F1',
  leadId: null,
  archivedAt: null,
  createdAt: '2026-05-31T12:00:00.000Z',
};

const cannedMember: ProjectMember = { userId: SEED_USER_ID, role: 'ADMIN', name: 'Founder' };
const OTHER_PROJECT_ID = '0193b3a0-0000-7000-8000-0000000000e1';
const OTHER_USER_ID = '0193b3a0-0000-7000-8000-0000000000e2';

const mockProjects = {
  list: vi.fn(async () => ({
    data: [cannedProject],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  get: vi.fn(async (id: string) => {
    if (id === OTHER_PROJECT_ID) {
      throw new ForbiddenException('Requires project role VIEWER');
    }
    return { data: cannedProject };
  }),
  create: vi.fn(async () => ({ data: cannedProject })),
  update: vi.fn(async () => ({
    data: { ...cannedProject, archivedAt: '2026-05-31T12:00:00.000Z' },
  })),
  delete: vi.fn(async (): Promise<void> => {}),
  listMembers: vi.fn(async () => ({
    data: [cannedMember],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  addMember: vi.fn(async (): Promise<void> => {}),
};

const mockWorkItems = {
  list: vi.fn(async () => ({
    data: [],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
};

describe('ProjectsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ProjectsService)
      .useValue(mockProjects)
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
      .set('x-user-id', SEED_USER_ID)
      .set('x-organization-id', SEED_ORG_ID)
      .set('x-workspace-id', SEED_WORKSPACE_ID);

  it('GET /projects → 200 { data: Project[], pageInfo }', async () => {
    const res = await authed('get', '/projects').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].keyPrefix).toBe('MKT');
    expect(res.body.pageInfo.hasNextPage).toBe(false);
  });

  it('POST /projects → 201 { data }', async () => {
    const res = await authed('post', '/projects').send({ name: 'Marketing', keyPrefix: 'MKT' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(SEED_PROJECT_ID);
  });

  it('POST /projects unknown field → 400 (strict)', async () => {
    const res = await authed('post', '/projects').send({
      name: 'X',
      keyPrefix: 'XY',
      bogus: true,
    });
    expect(res.status).toBe(400);
  });

  it('POST /projects bad key prefix → 400', async () => {
    const res = await authed('post', '/projects').send({ name: 'X', keyPrefix: 'lowercase' });
    expect(res.status).toBe(400);
  });

  it('GET /projects/{id} → 200 { data }', async () => {
    const res = await authed('get', `/projects/${SEED_PROJECT_ID}`).send();
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(SEED_PROJECT_ID);
  });

  it('GET /projects/{id} non-member → 403 (FR-PROJ-002)', async () => {
    const res = await authed('get', `/projects/${OTHER_PROJECT_ID}`).send();
    expect(res.status).toBe(403);
  });

  it('PATCH /projects/{id} (archive) → 200 { data with archivedAt }', async () => {
    const res = await authed('patch', `/projects/${SEED_PROJECT_ID}`).send({ archived: true });
    expect(res.status).toBe(200);
    expect(res.body.data.archivedAt).not.toBeNull();
  });

  it('PATCH /projects/{id} unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/projects/${SEED_PROJECT_ID}`).send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it('DELETE /projects/{id} → 204', async () => {
    const res = await authed('delete', `/projects/${SEED_PROJECT_ID}`).send();
    expect(res.status).toBe(204);
  });

  it('GET /projects/{id}/members → 200 { data, pageInfo }', async () => {
    const res = await authed('get', `/projects/${SEED_PROJECT_ID}/members`).send();
    expect(res.status).toBe(200);
    expect(res.body.data[0].userId).toBe(SEED_USER_ID);
  });

  it('POST /projects/{id}/members → 201', async () => {
    const res = await authed('post', `/projects/${SEED_PROJECT_ID}/members`).send({
      userId: OTHER_USER_ID,
      role: 'MEMBER',
    });
    expect(res.status).toBe(201);
  });

  it('POST /projects/{id}/members unknown field → 400 (strict)', async () => {
    const res = await authed('post', `/projects/${SEED_PROJECT_ID}/members`).send({
      userId: OTHER_USER_ID,
      bogus: true,
    });
    expect(res.status).toBe(400);
  });

  it('GET /work-items?smart=my-work → 200 { data, pageInfo }', async () => {
    const res = await authed('get', '/work-items?smart=my-work').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(mockWorkItems.list).toHaveBeenCalled();
  });
});
