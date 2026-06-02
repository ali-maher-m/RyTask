import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  organizations,
  runMigrations,
  seed,
  users,
  workspaces,
} from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { type StartedPostgres, startPostgres } from './postgres';
import { withPrincipal } from './with-principal';

/**
 * Single-org end-to-end + no-migration assertion (T081, US5, FR-TEN-003, SC-009). A fresh
 * instance runs end-to-end with the tenant boundary fully enforced for a single org, and
 * enabling a **second** org needs **no schema change** — the schema is multi-tenant by
 * construction. Proven by (a) a real-principal flow against org A and (b) inserting a full
 * second org after migrations with zero additional migration + an idempotent re-run.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000c9';
const USER_B = '0193b3a0-0000-7000-8000-0000000000ca';
const WS_B = '0193b3a0-0000-7000-8000-0000000000cb';

const asOrgA = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('single-org end-to-end + no-migration for a second org', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

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

  it('runs end-to-end for a single org with the boundary enforced', async () => {
    const org = await request(app.getHttpServer())
      .get('/api/v1/orgs/current')
      .set('authorization', asOrgA());
    expect(org.status).toBe(200);
    expect(org.body.id).toBe(SEED_ORG_ID);

    const projects = await request(app.getHttpServer())
      .get('/api/v1/projects')
      .set('authorization', asOrgA());
    expect(projects.status).toBe(200);
    expect(Array.isArray(projects.body.data)).toBe(true);

    // A real mutation through the full guard chain (auth → tenant → rbac) + scoped write.
    const created = await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('authorization', asOrgA())
      .send({ email: 'teammate@a.test', role: 'MEMBER' });
    expect(created.status).toBe(201);

    const invites = await request(app.getHttpServer())
      .get('/api/v1/invites')
      .set('authorization', asOrgA());
    expect(invites.status).toBe(200);
    expect(JSON.stringify(invites.body)).toContain('teammate@a.test');
  });

  it('admits a second org with no schema change (FR-TEN-003, SC-009)', async () => {
    // Inserting a full second org against the already-migrated schema must just work.
    await expect(
      (async () => {
        await handle.db
          .insert(organizations)
          .values({ id: ORG_B, name: 'Org B', slug: 'org-b-nm' });
        await handle.db
          .insert(workspaces)
          .values({ id: WS_B, organizationId: ORG_B, name: 'B', slug: 'b-nm' });
        await handle.db
          .insert(users)
          .values({ id: USER_B, organizationId: ORG_B, email: 'b@nm.test', name: 'B' });
        await handle.db
          .insert(memberships)
          .values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
      })(),
    ).resolves.not.toThrow();

    const orgs = await handle.db.select().from(organizations);
    expect(orgs.length).toBeGreaterThanOrEqual(2);
  });

  it('re-running migrations is idempotent (no pending change for a 2nd org)', async () => {
    await expect(runMigrations(pg.url)).resolves.not.toThrow();
  });
});
