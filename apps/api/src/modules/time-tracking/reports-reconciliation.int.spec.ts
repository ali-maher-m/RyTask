import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_TIME_LOG_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  projectCounters,
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
import { ReportOverviewProvider } from './providers/report-overview.provider';
import { TimeSummaryProvider } from './providers/time-summary.provider';
import { WeeklySummaryProvider } from './providers/weekly-summary.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';

/**
 * The SC-002/SC-003 reconciliation authority (T053, MANDATORY). One fixture seeds TWO orgs; under org
 * A it exercises all three report endpoints + `GET /time/summary` for the same range/scope and asserts
 * the cross-surface invariants: `planned + interruption === logged` at every level, and
 * `overview.interruptionSeconds === ledger.totalSeconds === Σ ledger.weeks` — while org B's data never
 * leaks into org A's numbers (tenant isolation, Principle II).
 */
const CTX_A = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const RY_2 = '0193b3a0-0000-7000-8000-000000000021';
const W1_DAY = '2026-06-03'; // week of 2026-06-01
const W2_DAY = '2026-06-10'; // week of 2026-06-08
const FROM = '2026-06-01';
const TO = '2026-06-14';
const W2_MON = '2026-06-08';

// Org B — its data must never appear in org A's reports.
const ORG_B = '0193b3a0-0000-7000-8000-0000000b0001';
const WS_B = '0193b3a0-0000-7000-8000-0000000b0002';
const USER_B = '0193b3a0-0000-7000-8000-0000000b0003';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000b0010';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000b0011';
const ITEM_B = '0193b3a0-0000-7000-8000-0000000b0020';
const CTX_B = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const reconciles = (t: {
  loggedSeconds: number;
  plannedSeconds: number;
  interruptionSeconds: number;
}) => t.plannedSeconds + t.interruptionSeconds === t.loggedSeconds;

const entry = (
  workItemId: string,
  day: string,
  durationSeconds: number,
  classification: 'PLANNED' | 'INTERRUPTION',
  ctx = { workspaceId: SEED_WORKSPACE_ID, projectId: SEED_PROJECT_ID, userId: SEED_USER_ID },
) => ({
  workspaceId: ctx.workspaceId,
  projectId: ctx.projectId,
  workItemId,
  userId: ctx.userId,
  startedAt: new Date(`${day}T09:00:00.000Z`),
  endedAt: new Date(`${day}T09:00:00.000Z`),
  durationSeconds,
  source: 'MANUAL' as const,
  classification,
});

describe('M4 reports cross-surface reconciliation (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let overview: ReportOverviewProvider;
  let ledger: InterruptionLedgerProvider;
  let weekly: WeeklySummaryProvider;
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
    overview = new ReportOverviewProvider(timeLogs, projectsAccess);
    ledger = new InterruptionLedgerProvider(timeLogs, projectsAccess);
    weekly = new WeeklySummaryProvider(timeLogs, projectsAccess, workItemAccess, tenant);
    summary = new TimeSummaryProvider(timeLogs, projectsAccess);

    // Org B: a full minimal tenant whose interruption time (9999s) must stay invisible to org A.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Other Co', slug: 'other' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@other.local', name: 'Bee' });
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
      title: 'Theirs',
      statusId: STATUS_B,
    });

    await tenant.run(CTX_A, async () => {
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      await timeLogs.create(entry(RY_1, W1_DAY, 3600, 'PLANNED'));
      await timeLogs.create(entry(RY_1, W2_DAY, 7200, 'PLANNED'));
      await timeLogs.create(entry(RY_2, W1_DAY, 1800, 'INTERRUPTION'));
      await timeLogs.create(entry(RY_2, W2_DAY, 600, 'PLANNED'));
    });
    await tenant.run(CTX_B, () =>
      timeLogs.create(
        entry(ITEM_B, W1_DAY, 9999, 'INTERRUPTION', {
          workspaceId: WS_B,
          projectId: PROJECT_B,
          userId: USER_B,
        }),
      ),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('overview reconciles at the headline and every week (planned + interruption === logged)', async () => {
    const ov = await tenant.run(CTX_A, () =>
      overview.getOverview({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    expect(ov.totals).toEqual({
      loggedSeconds: 13200,
      plannedSeconds: 11400,
      interruptionSeconds: 1800,
    });
    expect(reconciles(ov.totals)).toBe(true);
    expect(ov.weeks.every(reconciles)).toBe(true);
    expect(ov.weeks.reduce((s, w) => s + w.loggedSeconds, 0)).toBe(ov.totals.loggedSeconds);
    // Org B's 9999s never appears.
    expect(ov.totals.loggedSeconds).toBe(13200);
  });

  it('ledger total === overview interruption === Σ ledger weeks (SC-003)', async () => {
    const scope = { from: FROM, to: TO, projectId: SEED_PROJECT_ID };
    const [ov, led] = await tenant.run(CTX_A, () =>
      Promise.all([overview.getOverview(scope), ledger.getLedger(scope)]),
    );
    expect(led.totalSeconds).toBe(ov.totals.interruptionSeconds);
    expect(led.weeks.reduce((s, w) => s + w.seconds, 0)).toBe(led.totalSeconds);
    expect(led.items.reduce((s, i) => s + i.seconds, 0)).toBe(led.totalSeconds);
    expect(led.totalSeconds).toBe(1800); // org B's 9999 excluded
  });

  it('weekly totals reconcile and match GET /time/summary for the same week', async () => {
    const [wk, rows] = await tenant.run(CTX_A, () =>
      Promise.all([
        weekly.getWeek({ weekStart: W2_MON, userId: SEED_USER_ID }),
        summary.getSummary({
          groupBy: 'period',
          period: 'week',
          userId: SEED_USER_ID,
          from: W2_MON,
          to: TO,
        }),
      ]),
    );
    expect(reconciles(wk.totals)).toBe(true);
    expect(wk.totals.loggedSeconds).toBe(7800); // RY_1 7200 + RY_2 600 in week 06-08
    const weekRow = rows.find((r) => r.key === W2_MON);
    expect(weekRow?.loggedSeconds).toBe(wk.totals.loggedSeconds);
    expect(weekRow?.interruptionSeconds).toBe(wk.totals.interruptionSeconds);
  });

  it('GET /time/summary (by item) reconciles and sums to the overview logged total', async () => {
    const [rows, ov] = await tenant.run(CTX_A, () =>
      Promise.all([
        summary.getSummary({ groupBy: 'item', from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
        overview.getOverview({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
      ]),
    );
    expect(rows.every(reconciles)).toBe(true);
    expect(rows.reduce((s, r) => s + r.loggedSeconds, 0)).toBe(ov.totals.loggedSeconds);
    // None of org B's items appear.
    expect(rows.some((r) => r.key === ITEM_B)).toBe(false);
  });
});
