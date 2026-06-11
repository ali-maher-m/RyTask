import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_TIME_LOG_IDS,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../common/testing/postgres';
import { ProjectMembersRepository } from '../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../projects/services/project-access.service';
import { ActivityRepository } from '../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../work-items/services/work-item-access.service';
import { InterruptionLedgerProvider } from './providers/interruption-ledger.provider';
import { WeeklySummaryProvider } from './providers/weekly-summary.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';

/**
 * Cross-tenant isolation for the M4 read-models (T054, MANDATORY, Principle II). Two orgs each with
 * interruption time: org A's ledger/weekly read-models never surface org B's rows, and vice versa —
 * the `TenantScopedRepository` org filter holds for the new joins. Both `from` orgs are real fixtures
 * so isolation is asserted bidirectionally, not just by absence.
 */
const W_DAY = '2026-06-10';
const WEEK_MON = '2026-06-08';
const FROM = '2026-06-01';
const TO = '2026-06-14';

const ITEM_A = '0193b3a0-0000-7000-8000-00000000a201'; // org A interruption item
const ORG_B = '0193b3a0-0000-7000-8000-00000000b201';
const WS_B = '0193b3a0-0000-7000-8000-00000000b202';
const USER_B = '0193b3a0-0000-7000-8000-00000000b203';
const PROJECT_B = '0193b3a0-0000-7000-8000-00000000b210';
const STATUS_B = '0193b3a0-0000-7000-8000-00000000b211';
const ITEM_B = '0193b3a0-0000-7000-8000-00000000b220';

const CTX_A = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const CTX_B = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('M4 reports cross-tenant isolation (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let ledger: InterruptionLedgerProvider;
  let weekly: WeeklySummaryProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const timeLogs = new TimeLogsRepository(handle.db, tenant);
    const projectsAccess = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    const workItemAccess = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    ledger = new InterruptionLedgerProvider(timeLogs, projectsAccess);
    weekly = new WeeklySummaryProvider(timeLogs, projectsAccess, workItemAccess, tenant);

    // Org A: a single interruption item with time assigned to the founder.
    await handle.db.insert(workItems).values({
      id: ITEM_A,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      projectId: SEED_PROJECT_ID,
      number: 920,
      title: 'Org A outage',
      statusId: SEED_STATUS_IDS.todo,
      assigneeId: SEED_USER_ID,
    });

    // Org B: a full minimal tenant whose user is a project member.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Other Co', slug: 'other2' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws2' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b2@other.local', name: 'Bee' });
    await handle.db
      .insert(memberships)
      .values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
    await handle.db.insert(projects).values({
      id: PROJECT_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Theirs',
      keyPrefix: 'OTH',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJECT_B, organizationId: ORG_B, lastNumber: 1 });
    await handle.db
      .insert(projectMembers)
      .values({ organizationId: ORG_B, projectId: PROJECT_B, userId: USER_B, role: 'ADMIN' });
    await handle.db.insert(statuses).values({
      id: STATUS_B,
      organizationId: ORG_B,
      projectId: PROJECT_B,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await handle.db.insert(workItems).values({
      id: ITEM_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      projectId: PROJECT_B,
      number: 1,
      title: 'Org B outage',
      statusId: STATUS_B,
      assigneeId: USER_B,
    });

    await tenant.run(CTX_A, async () => {
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      await timeLogs.create({
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        workItemId: ITEM_A,
        userId: SEED_USER_ID,
        startedAt: new Date(`${W_DAY}T09:00:00.000Z`),
        endedAt: new Date(`${W_DAY}T09:00:00.000Z`),
        durationSeconds: 1234,
        source: 'MANUAL',
        classification: 'INTERRUPTION',
      });
    });
    await tenant.run(CTX_B, () =>
      timeLogs.create({
        workspaceId: WS_B,
        projectId: PROJECT_B,
        workItemId: ITEM_B,
        userId: USER_B,
        startedAt: new Date(`${W_DAY}T09:00:00.000Z`),
        endedAt: new Date(`${W_DAY}T09:00:00.000Z`),
        durationSeconds: 4321,
        source: 'MANUAL',
        classification: 'INTERRUPTION',
      }),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('the ledger shows only the caller-org’s items (neither org sees the other)', async () => {
    const ledA = await tenant.run(CTX_A, () => ledger.getLedger({ from: FROM, to: TO }));
    expect(ledA.items.map((i) => i.workItemId)).toContain(ITEM_A);
    expect(ledA.items.map((i) => i.workItemId)).not.toContain(ITEM_B);
    expect(ledA.totalSeconds).toBe(1234);

    const ledB = await tenant.run(CTX_B, () => ledger.getLedger({ from: FROM, to: TO }));
    expect(ledB.items.map((i) => i.workItemId)).toContain(ITEM_B);
    expect(ledB.items.map((i) => i.workItemId)).not.toContain(ITEM_A);
    expect(ledB.totalSeconds).toBe(4321);
  });

  it('the weekly summary shows only the caller-org’s tracked items', async () => {
    const wkA = await tenant.run(CTX_A, () => weekly.getWeek({ weekStart: WEEK_MON }));
    expect(wkA.items.map((i) => i.workItemId)).toContain(ITEM_A);
    expect(wkA.items.map((i) => i.workItemId)).not.toContain(ITEM_B);

    const wkB = await tenant.run(CTX_B, () => weekly.getWeek({ weekStart: WEEK_MON }));
    expect(wkB.items.map((i) => i.workItemId)).toContain(ITEM_B);
    expect(wkB.items.map((i) => i.workItemId)).not.toContain(ITEM_A);
  });
});
