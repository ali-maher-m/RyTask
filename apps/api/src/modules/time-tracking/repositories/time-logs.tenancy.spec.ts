import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
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
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { TimeLogsRepository } from './time-logs.repository';

/**
 * Cross-tenant isolation for `time_logs` (T079, FR-X-001, SC-006). Org A can never read / edit /
 * delete / aggregate Org B's time entries — enforced structurally by `TenantScopedRepository`
 * (auto `WHERE organization_id`), proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000f1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000f2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000f3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000f4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000f5';
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('time_logs tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let wiRepo: WorkItemsRepository;
  let itemBId: string;
  let logAId: string;
  let logBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    wiRepo = new WorkItemsRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-tl' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-tl' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@tl.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OBL',
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

    const b = await tenant.run(ctxB, () =>
      wiRepo.createWorkItem({
        projectId: PROJ_B,
        title: 'B',
        statusId: STATUS_B,
        priority: 'NONE',
      }),
    );
    itemBId = b.item.id;

    const logA = await tenant.run(ctxA, () =>
      timeLogs.create({
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        workItemId: RY_1,
        userId: SEED_USER_ID,
        startedAt: new Date('2026-06-09T09:00:00.000Z'),
        endedAt: new Date('2026-06-09T10:00:00.000Z'),
        durationSeconds: 3600,
        source: 'MANUAL',
        classification: 'PLANNED',
      }),
    );
    const logB = await tenant.run(ctxB, () =>
      timeLogs.create({
        workspaceId: WS_B,
        projectId: PROJ_B,
        workItemId: itemBId,
        userId: USER_B,
        startedAt: new Date('2026-06-09T09:00:00.000Z'),
        endedAt: new Date('2026-06-09T10:00:00.000Z'),
        durationSeconds: 1800,
        source: 'MANUAL',
        classification: 'INTERRUPTION',
      }),
    );
    logAId = logA.id;
    logBId = logB.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org reads only its own entries', async () => {
    expect(await tenant.run(ctxA, () => timeLogs.findById(logAId))).not.toBeNull();
    expect(await tenant.run(ctxB, () => timeLogs.findById(logBId))).not.toBeNull();
  });

  it('never resolves another org’s entry by id', async () => {
    expect(await tenant.run(ctxA, () => timeLogs.findById(logBId))).toBeNull();
    expect(await tenant.run(ctxB, () => timeLogs.findById(logAId))).toBeNull();
  });

  it('never leaks an entry list across tenants', async () => {
    expect(await tenant.run(ctxA, () => timeLogs.listForItem(itemBId))).toHaveLength(0);
    expect(await tenant.run(ctxB, () => timeLogs.listForItem(RY_1))).toHaveLength(0);
  });

  it('never leaks across tenants in the rollup or the summary', async () => {
    // Org A cannot see Org B's project rollup; Org B's project total is invisible to A.
    expect(await tenant.run(ctxA, () => timeLogs.rollupByItem(PROJ_B))).toHaveLength(0);
    const summaryA = await tenant.run(ctxA, () => timeLogs.summarize({ groupBy: 'project' }));
    expect(summaryA.some((r) => r.key === PROJ_B)).toBe(false);
  });

  it('a cross-org edit or delete is a no-op — the other org’s entry is untouched', async () => {
    expect(
      await tenant.run(ctxA, () => timeLogs.update(logBId, { durationSeconds: 9999 })),
    ).toBeNull();
    expect(await tenant.run(ctxA, () => timeLogs.softDelete(logBId, new Date()))).toBeNull();
    const survivor = await tenant.run(ctxB, () => timeLogs.findById(logBId));
    expect(survivor?.durationSeconds).toBe(1800);
    expect(survivor?.deletedAt).toBeNull();
  });
});
