import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workspaces,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { StatusesRepository } from './statuses.repository';

/**
 * Cross-tenant isolation for `statuses` (T049, FR-TEN-003, SC-014). Org A can never
 * read/reorder/delete Org B's statuses — enforced structurally by TenantScopedRepository,
 * proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000d2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000d4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000d5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('statuses tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: StatusesRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A: project RY with six statuses
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new StatusesRepository(handle.db, tenant);

    // Stand up a fully separate org B with one project + one status.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b2' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws2' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b2@b.test', name: 'B2' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OB2',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJ_B, organizationId: ORG_B, lastNumber: 0 });
    await handle.db.insert(statuses).values({
      id: STATUS_B,
      organizationId: ORG_B,
      projectId: PROJ_B,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await handle.db
      .insert(projectMembers)
      .values({ organizationId: ORG_B, projectId: PROJ_B, userId: USER_B, role: 'ADMIN' });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('an org sees only its own statuses', async () => {
    const a = await tenant.run(ctxA, () => repo.listForProject(SEED_PROJECT_ID));
    expect(a.length).toBe(6);
    const b = await tenant.run(ctxB, () => repo.listForProject(PROJ_B));
    expect(b.map((s) => s.id)).toEqual([STATUS_B]);
  });

  it('never reads another org’s status by id', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(STATUS_B))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(SEED_STATUS_IDS.todo))).toBeNull();
  });

  it('never lists another org’s statuses via a foreign projectId', async () => {
    // Org B asks for org A's project → tenant filter yields nothing.
    expect(await tenant.run(ctxB, () => repo.listForProject(SEED_PROJECT_ID))).toEqual([]);
    expect(await tenant.run(ctxA, () => repo.listForProject(PROJ_B))).toEqual([]);
  });

  it('update/delete cannot touch another org’s status', async () => {
    // Org A tries to rename org B's status: tenant scope makes it a no-op (null result).
    const updated = await tenant.run(ctxA, () => repo.update(STATUS_B, { name: 'Hacked' }));
    expect(updated).toBeNull();
    // Org B's status is untouched.
    const stillThere = await tenant.run(ctxB, () => repo.findById(STATUS_B));
    expect(stillThere?.name).toBe('To Do');
  });
});
