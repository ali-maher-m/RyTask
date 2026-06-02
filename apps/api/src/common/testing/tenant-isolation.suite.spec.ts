import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type Database,
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  invitations,
  labels,
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
 * Cross-tenant isolation **suite** (T079, US5, FR-TEST-007, SC-008, Principle II). Boots the
 * whole API against a REAL Postgres with two orgs and drives every M0 + M1 read/list/search
 * surface as a **real principal** of org A (`withPrincipal()` — the dev header is gone). Each
 * response must contain only A's rows and never any of B's: 0 cross-tenant leakage. This is
 * the milestone's headline correctness guarantee, enforced end-to-end (middleware → guards →
 * tenant-scoped repositories), not just at the repository layer.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000e1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000e2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000e3';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000000e4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000e5';
const WORKITEM_B = '0193b3a0-0000-7000-8000-0000000000e6';
const LABEL_B = '0193b3a0-0000-7000-8000-0000000000e7';

const B_PROJECT_NAME = 'ORG-B-SECRET-PROJECT';
const B_WORKITEM_TITLE = 'ORG-B-SECRET-WORKITEM';
const B_LABEL_NAME = 'ORG-B-SECRET-LABEL';
const B_INVITE_EMAIL = 'org-b-secret@b.test';

async function seedOrgB(db: Database): Promise<void> {
  await db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-iso' });
  await db
    .insert(workspaces)
    .values({ id: WS_B, organizationId: ORG_B, name: 'B Workspace', slug: 'b-default' });
  await db
    .insert(users)
    .values({ id: USER_B, organizationId: ORG_B, email: 'owner@b.test', name: 'B Owner' });
  await db.insert(memberships).values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
  await db.insert(projects).values({
    id: PROJECT_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    name: B_PROJECT_NAME,
    keyPrefix: 'ORGB',
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
    title: B_WORKITEM_TITLE,
    statusId: STATUS_B,
    priority: 'HIGH',
    reporterId: USER_B,
    position: '1024',
  });
  await db
    .insert(labels)
    .values({ id: LABEL_B, organizationId: ORG_B, workspaceId: WS_B, name: B_LABEL_NAME });
  await db.insert(invitations).values({
    organizationId: ORG_B,
    email: B_INVITE_EMAIL,
    role: 'MEMBER',
    tokenHash: 'org-b-invite-hash',
    invitedByUserId: USER_B,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

const asOrgA = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('cross-tenant isolation suite (M0 + M1, real principals)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url); // org A: founder OWNER + project + work items
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

  it('GET /workspaces returns only org A workspaces', async () => {
    const res = await get('/api/v1/workspaces');
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((w) => w.id);
    expect(ids).toContain(SEED_WORKSPACE_ID);
    expect(ids).not.toContain(WS_B);
  });

  it('GET /orgs/current is org A (never B)', async () => {
    const res = await get('/api/v1/orgs/current');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SEED_ORG_ID);
  });

  it('GET /projects returns only org A projects', async () => {
    const res = await get('/api/v1/projects');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(SEED_PROJECT_ID);
    expect(ids).not.toContain(PROJECT_B);
    expect(JSON.stringify(res.body)).not.toContain(B_PROJECT_NAME);
  });

  it('GET /work-items returns only org A items', async () => {
    const res = await get('/api/v1/work-items');
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ id: string }>).map((w) => w.id);
    expect(ids).not.toContain(WORKITEM_B);
    expect(JSON.stringify(res.body)).not.toContain(B_WORKITEM_TITLE);
  });

  it('GET /labels returns only org A labels', async () => {
    const res = await get('/api/v1/labels');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(B_LABEL_NAME);
    expect(JSON.stringify(res.body)).not.toContain(LABEL_B);
  });

  it('GET /invites returns only org A invites', async () => {
    const res = await get('/api/v1/invites');
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(B_INVITE_EMAIL);
  });

  it('GET /search never returns org B rows (FR-TEST-007)', async () => {
    const res = await get(`/api/v1/search?q=${encodeURIComponent('SECRET')}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(B_WORKITEM_TITLE);
    expect(body).not.toContain(B_PROJECT_NAME);
    expect(body).not.toContain(B_LABEL_NAME);
  });

  it('GET /work-items/{B-id} is 404 (existence never leaked, never 403)', async () => {
    const res = await get(`/api/v1/work-items/${WORKITEM_B}`);
    expect(res.status).toBe(404);
  });
});
