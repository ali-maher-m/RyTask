import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_TIME_LOG_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  projectCounters,
  projects,
  runMigrations,
  seed,
  statuses,
  workItems,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { TimeSummaryProvider } from './time-summary.provider';
import { WeeklySummaryProvider } from './weekly-summary.provider';

/**
 * Integration test for "My week" against REAL PostgreSQL (US3, T033, FR-RPT-007). For one user / one
 * Mon–Sun week: the split totals, the per-item tracked-beside-estimate rows (with the `completed`
 * flag), and the assigned-completed-this-week list (via the work-items contract). The totals reconcile
 * with `GET /time/summary?groupBy=period&userId=…` for the same week (SC-002); visibility is scoped to
 * the caller's readable projects (FR-013).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const WEEK_START = '2026-06-08'; // Monday
const WEEK_END = '2026-06-14';
const W_DAY = '2026-06-10'; // Wednesday, inside the week

const ITEM_A = '0193b3a0-0000-7000-8000-0000000000f1'; // estimate 8h, completed this week
const ITEM_B = '0193b3a0-0000-7000-8000-0000000000f2'; // no estimate, not completed
const PROJ_2 = '0193b3a0-0000-7000-8000-0000000000f3'; // unreadable by SEED_USER
const PROJ_2_STATUS = '0193b3a0-0000-7000-8000-0000000000f4';
const PROJ_2_ITEM = '0193b3a0-0000-7000-8000-0000000000f5';

const entry = (
  workItemId: string,
  durationSeconds: number,
  classification: 'PLANNED' | 'INTERRUPTION',
  projectId = SEED_PROJECT_ID,
) => ({
  workspaceId: SEED_WORKSPACE_ID,
  projectId,
  workItemId,
  userId: SEED_USER_ID,
  startedAt: new Date(`${W_DAY}T09:00:00.000Z`),
  endedAt: new Date(`${W_DAY}T09:00:00.000Z`),
  durationSeconds,
  source: 'MANUAL' as const,
  classification,
});

describe('WeeklySummaryProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let provider: WeeklySummaryProvider;
  let summary: TimeSummaryProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    const projectsAccess = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    const workItemAccess = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    provider = new WeeklySummaryProvider(timeLogs, projectsAccess, workItemAccess, tenant);
    summary = new TimeSummaryProvider(timeLogs, projectsAccess);

    await handle.db.insert(workItems).values([
      {
        id: ITEM_A,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: 870,
        title: 'Ship the report',
        statusId: SEED_STATUS_IDS.todo,
        assigneeId: SEED_USER_ID,
        estimateValue: '8',
        completedAt: new Date(`${W_DAY}T15:00:00.000Z`),
      },
      {
        id: ITEM_B,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: 871,
        title: 'Triage the outage',
        statusId: SEED_STATUS_IDS.todo,
        assigneeId: SEED_USER_ID,
      },
    ]);

    // A second project SEED_USER is NOT a member of (its time must be invisible to "my week").
    await handle.db.insert(projects).values({
      id: PROJ_2,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: 'Secret',
      keyPrefix: 'SEC',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJ_2, organizationId: SEED_ORG_ID, lastNumber: 1 });
    await handle.db.insert(statuses).values({
      id: PROJ_2_STATUS,
      organizationId: SEED_ORG_ID,
      projectId: PROJ_2,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await handle.db.insert(workItems).values({
      id: PROJ_2_ITEM,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      projectId: PROJ_2,
      number: 1,
      title: 'Unreadable',
      statusId: PROJ_2_STATUS,
      assigneeId: SEED_USER_ID,
    });

    await tenant.run(CTX, async () => {
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      await timeLogs.create(entry(ITEM_A, 7200, 'PLANNED'));
      await timeLogs.create(entry(ITEM_B, 1800, 'INTERRUPTION'));
      // SEED_USER's time in the unreadable project — must NOT appear in their "my week".
      await timeLogs.create(entry(PROJ_2_ITEM, 5555, 'PLANNED', PROJ_2));
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('totals split and per-item rows match the seed (defaulting userId to the principal)', async () => {
    const wk = await tenant.run(CTX, () => provider.getWeek({ weekStart: WEEK_START }));
    expect(wk.weekStart).toBe(WEEK_START);
    expect(wk.weekEnd).toBe(WEEK_END);
    expect(wk.userId).toBe(SEED_USER_ID);
    expect(wk.totals).toEqual({
      loggedSeconds: 9000,
      plannedSeconds: 7200,
      interruptionSeconds: 1800,
    });

    // Items descending by logged seconds; the estimate is the raw numeric-as-string (or null).
    expect(wk.items.map((i) => i.workItemId)).toEqual([ITEM_A, ITEM_B]);
    expect(wk.items[0]).toMatchObject({ loggedSeconds: 7200, estimateValue: '8', completed: true });
    expect(wk.items[1]).toMatchObject({ loggedSeconds: 1800, estimateValue: null, completed: false });
    // The unreadable project's 5555s never appears.
    expect(wk.items.some((i) => i.loggedSeconds === 5555)).toBe(false);
  });

  it('lists items the subject completed in the week via the work-items contract', async () => {
    const wk = await tenant.run(CTX, () => provider.getWeek({ weekStart: WEEK_START }));
    expect(wk.completedItems.map((c) => c.workItemId)).toEqual([ITEM_A]);
    expect(wk.completedItems[0]).toMatchObject({ projectId: SEED_PROJECT_ID });
    expect(typeof wk.completedItems[0]?.completedAt).toBe('string');
  });

  it('reconciles with GET /time/summary (groupBy=period&userId) for the same week (SC-002)', async () => {
    const [wk, rows] = await tenant.run(CTX, () =>
      Promise.all([
        provider.getWeek({ weekStart: WEEK_START }),
        summary.getSummary({
          groupBy: 'period',
          period: 'week',
          userId: SEED_USER_ID,
          from: WEEK_START,
          to: WEEK_END,
        }),
      ]),
    );
    const weekRow = rows.find((r) => r.key === WEEK_START);
    expect(weekRow?.loggedSeconds).toBe(wk.totals.loggedSeconds);
    expect(weekRow?.interruptionSeconds).toBe(wk.totals.interruptionSeconds);
  });
});
