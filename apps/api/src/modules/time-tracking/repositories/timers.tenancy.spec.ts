import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_STATUS_IDS,
  SEED_TIMER_ID,
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
import { TimersRepository } from './timers.repository';

/**
 * Cross-tenant isolation for `timers` (T078, FR-X-001, SC-006). Org A can never read/stop/delete Org
 * B's running timer — enforced structurally by `TenantScopedRepository` (auto `WHERE organization_id`),
 * proven against real Postgres. Org A uses the seeded running timer; Org B is a fully separate tenant.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000e1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000e2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000e3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000e4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000e5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('timers tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timers: TimersRepository;
  let wiRepo: WorkItemsRepository;
  let timerBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A (incl. the seeded running timer SEED_TIMER_ID)
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timers = new TimersRepository(handle.db, tenant);
    wiRepo = new WorkItemsRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-tmr' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-tmr' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@tmr.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OBT',
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
    const timerB = await tenant.run(ctxB, () =>
      timers.create({
        workspaceId: WS_B,
        workItemId: b.item.id,
        userId: USER_B,
        startedAt: new Date('2026-06-09T09:00:00.000Z'),
      }),
    );
    timerBId = timerB.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org reads only its own running timer', async () => {
    expect(await tenant.run(ctxA, () => timers.findById(SEED_TIMER_ID))).not.toBeNull();
    expect(await tenant.run(ctxB, () => timers.findById(timerBId))).not.toBeNull();
  });

  it('never resolves another org’s timer by id', async () => {
    expect(await tenant.run(ctxA, () => timers.findById(timerBId))).toBeNull();
    expect(await tenant.run(ctxB, () => timers.findById(SEED_TIMER_ID))).toBeNull();
  });

  it('findActiveForUser is tenant-scoped (the seed user has no timer in org B)', async () => {
    expect(await tenant.run(ctxA, () => timers.findActiveForUser(SEED_USER_ID))).not.toBeNull();
    expect(await tenant.run(ctxB, () => timers.findActiveForUser(SEED_USER_ID))).toBeNull();
  });

  it('a cross-org delete is a no-op — the other org’s timer survives', async () => {
    await tenant.run(ctxA, () => timers.delete(timerBId)); // org A can't reach org B's row
    expect(await tenant.run(ctxB, () => timers.findById(timerBId))).not.toBeNull();
  });
});
