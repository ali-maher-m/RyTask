import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type Database,
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workItems,
  workspaces,
} from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { type StartedPostgres, startPostgres } from './postgres';
import { withPrincipal } from './with-principal';

/**
 * Cross-tenant id-probe (T080, US5, SC-008, contracts error table). Referencing another
 * org's resource **by id** as org A must return **404** — existence is never leaked, and it
 * is never a 403 (which would itself confirm the row exists). Tenant scope is applied before
 * RBAC, so a cross-org id is indistinguishable from a non-existent one.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000f1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000f2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000f3';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000000f4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000f5';
const WORKITEM_B = '0193b3a0-0000-7000-8000-0000000000f6';

async function seedOrgB(db: Database): Promise<void> {
  await db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-probe' });
  await db
    .insert(workspaces)
    .values({ id: WS_B, organizationId: ORG_B, name: 'B Workspace', slug: 'b-probe' });
  await db
    .insert(users)
    .values({ id: USER_B, organizationId: ORG_B, email: 'owner@bprobe.test', name: 'B Owner' });
  await db.insert(memberships).values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
  await db.insert(projects).values({
    id: PROJECT_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    name: 'B Project',
    keyPrefix: 'BPRB',
  });
  await db
    .insert(projectMembers)
    .values({ organizationId: ORG_B, projectId: PROJECT_B, userId: USER_B, role: 'ADMIN' });
  await db.insert(statuses).values({
    id: STATUS_B,
    organizationId: ORG_B,
    projectId: PROJECT_B,
    name: 'To Do',
    category: 'UNSTARTED',
    position: 1,
  });
  await db
    .insert(projectCounters)
    .values({ projectId: PROJECT_B, organizationId: ORG_B, lastNumber: 1 });
  await db.insert(workItems).values({
    id: WORKITEM_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    projectId: PROJECT_B,
    number: 1,
    title: 'B item',
    statusId: STATUS_B,
    reporterId: USER_B,
    position: '1024',
  });
}

const asOrgA = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('cross-tenant id probe (404, never 403/leak)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    await seedOrgB(handle.db);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
    Reflect.deleteProperty(process.env, 'DATABASE_URL');
    await pg?.stop();
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('authorization', asOrgA());

  // Get-by-id (and sub-resources that load their parent by id first): a cross-org id is
  // indistinguishable from a non-existent one → 404, never 403, never a leak.
  const byId404 = [
    `/api/v1/projects/${PROJECT_B}`,
    `/api/v1/work-items/${WORKITEM_B}`,
    `/api/v1/work-items/${WORKITEM_B}/subtasks`,
    `/api/v1/work-items/${WORKITEM_B}/activity`,
    `/api/v1/work-items/${WORKITEM_B}/comments`,
  ];

  for (const path of byId404) {
    it(`${path} → 404 (never 403/leak)`, async () => {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  }

  // List-under-parent endpoints scope directly by the tenant + parent id, so a cross-org
  // parent yields **0 rows** (an empty 200 — also a non-leak). The security guarantee is the
  // same: never 403, and never any of org B's rows.
  const listNoLeak = [
    `/api/v1/projects/${PROJECT_B}/members`,
    `/api/v1/projects/${PROJECT_B}/statuses`,
  ];

  for (const path of listNoLeak) {
    it(`${path} → no cross-tenant leak (empty/404, never 403)`, async () => {
      const res = await get(path);
      expect(res.status).not.toBe(403);
      expect([200, 404]).toContain(res.status);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(USER_B);
      expect(body).not.toContain(STATUS_B);
    });
  }
});
