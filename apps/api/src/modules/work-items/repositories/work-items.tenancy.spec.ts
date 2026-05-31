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
import { ActivityRepository } from './activity.repository';
import { WorkItemsRepository } from './work-items.repository';

/**
 * Cross-tenant isolation for `work_items`, `project_counters`, `activity` (T018,
 * FR-TEN-003, SC-014). Org A can never read/write Org B's rows — enforced structurally
 * by TenantScopedRepository, proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000b2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000b3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000b4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000b5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('work-items tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: WorkItemsRepository;
  let activityRepo: ActivityRepository;
  let itemAId: string;
  let itemBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new WorkItemsRepository(handle.db, tenant);
    activityRepo = new ActivityRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OB',
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

    const a = await tenant.run(ctxA, () =>
      repo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'A',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
      }),
    );
    const b = await tenant.run(ctxB, () =>
      repo.createWorkItem({ projectId: PROJ_B, title: 'B', statusId: STATUS_B, priority: 'NONE' }),
    );
    itemAId = a.item.id;
    itemBId = b.item.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('an org can read its own item', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(itemAId))).not.toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(itemBId))).not.toBeNull();
  });

  it('never leaks work_items across tenants', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(itemBId))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(itemAId))).toBeNull();
  });

  it('never leaks activity across tenants', async () => {
    expect(await tenant.run(ctxA, () => activityRepo.listForItem(itemBId))).toHaveLength(0);
    expect(await tenant.run(ctxB, () => activityRepo.listForItem(itemAId))).toHaveLength(0);
  });
});
