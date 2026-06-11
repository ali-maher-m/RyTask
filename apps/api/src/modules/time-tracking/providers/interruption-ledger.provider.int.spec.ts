import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_TIME_LOG_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { InterruptionLedgerProvider } from './interruption-ledger.provider';
import { ReportOverviewProvider } from './report-overview.provider';

/**
 * Integration test for the interruption ledger against REAL PostgreSQL (US2, T024, FR-RPT-002). One
 * row per interruption-classified item (key/title, capture source, who raised it, entry count, seconds)
 * plus a per-week breakdown. Only INTERRUPTION entries contribute; `reporter` is null for a removed
 * user; the capture source is the item's M3 provenance; soft-deleted entries and trashed items are
 * excluded; and the ledger total reconciles to the overview's interruption figure for the same scope.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const W1_DAY = '2026-06-03'; // week of 2026-06-01
const W2_DAY = '2026-06-10'; // week of 2026-06-08
const FROM = '2026-06-01';
const TO = '2026-06-14';

const ITEM_1 = '0193b3a0-0000-7000-8000-0000000000b1'; // SLACK, reporter = founder
const ITEM_2 = '0193b3a0-0000-7000-8000-0000000000b2'; // WEB, reporter = null (removed)
const TRASH_ITEM = '0193b3a0-0000-7000-8000-0000000000b3';

const entry = (
  workItemId: string,
  day: string,
  durationSeconds: number,
  classification: 'PLANNED' | 'INTERRUPTION',
) => ({
  workspaceId: SEED_WORKSPACE_ID,
  projectId: SEED_PROJECT_ID,
  workItemId,
  userId: SEED_USER_ID,
  startedAt: new Date(`${day}T09:00:00.000Z`),
  endedAt: new Date(`${day}T09:00:00.000Z`),
  durationSeconds,
  source: 'MANUAL' as const,
  classification,
});

describe('InterruptionLedgerProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let provider: InterruptionLedgerProvider;
  let overviewProvider: ReportOverviewProvider;

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
    provider = new InterruptionLedgerProvider(timeLogs, projectsAccess);
    overviewProvider = new ReportOverviewProvider(timeLogs, projectsAccess);

    await handle.db.insert(workItems).values([
      {
        id: ITEM_1,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: 801,
        title: 'Outage triage',
        statusId: SEED_STATUS_IDS.todo,
        source: 'SLACK',
        reporterId: SEED_USER_ID,
      },
      {
        id: ITEM_2,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: 802,
        title: 'Pager fire drill',
        statusId: SEED_STATUS_IDS.todo,
        source: 'WEB',
        reporterId: null, // removed reporter
      },
      {
        id: TRASH_ITEM,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: 803,
        title: 'Trashed',
        statusId: SEED_STATUS_IDS.todo,
      },
    ]);

    await tenant.run(CTX, async () => {
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      // ITEM_1: two interruption entries (one per week) + one PLANNED entry (must NOT count).
      await timeLogs.create(entry(ITEM_1, W1_DAY, 1800, 'INTERRUPTION'));
      await timeLogs.create(entry(ITEM_1, W2_DAY, 1800, 'INTERRUPTION'));
      await timeLogs.create(entry(ITEM_1, W1_DAY, 9999, 'PLANNED'));
      // ITEM_2: one interruption entry (week 1).
      await timeLogs.create(entry(ITEM_2, W1_DAY, 1800, 'INTERRUPTION'));
      // A soft-deleted interruption entry (must NOT count).
      const doomed = await timeLogs.create(entry(ITEM_1, W1_DAY, 4242, 'INTERRUPTION'));
      await timeLogs.softDelete(doomed.id, new Date());
      // An interruption entry on a to-be-trashed item (must NOT count).
      await timeLogs.create(entry(TRASH_ITEM, W1_DAY, 7777, 'INTERRUPTION'));
    });
    await handle.db
      .update(workItems)
      .set({ deletedAt: new Date() })
      .where(eq(workItems.id, TRASH_ITEM));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists one row per interruption item with source, reporter, count, and seconds', async () => {
    const led = await tenant.run(CTX, () =>
      provider.getLedger({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    expect(led.totalSeconds).toBe(5400); // 1800 + 1800 + 1800
    expect(led.itemCount).toBe(2);
    expect(led.entryCount).toBe(3);

    // Ordered seconds DESC: ITEM_1 (3600) before ITEM_2 (1800).
    expect(led.items.map((i) => i.workItemId)).toEqual([ITEM_1, ITEM_2]);
    const i1 = led.items[0];
    expect(i1).toMatchObject({ captureSource: 'SLACK', entryCount: 2, seconds: 3600 });
    expect(i1?.reporter?.id).toBe(SEED_USER_ID);
    expect(typeof i1?.reporter?.name).toBe('string');

    const i2 = led.items[1];
    expect(i2).toMatchObject({ captureSource: 'WEB', entryCount: 1, seconds: 1800 });
    expect(i2?.reporter).toBeNull(); // removed reporter → "(removed user)" on screen
  });

  it('breaks interruptions down per ISO week, reconciling to the total', async () => {
    const led = await tenant.run(CTX, () =>
      provider.getLedger({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    const byWeek = Object.fromEntries(led.weeks.map((w) => [w.weekStart, w]));
    expect(byWeek['2026-06-01']).toMatchObject({ seconds: 3600, itemCount: 2 });
    expect(byWeek['2026-06-08']).toMatchObject({ seconds: 1800, itemCount: 1 });
    expect(led.weeks.reduce((s, w) => s + w.seconds, 0)).toBe(led.totalSeconds);
    expect(led.items.reduce((s, i) => s + i.seconds, 0)).toBe(led.totalSeconds);
  });

  it('reconciles to the overview interruption figure for the same scope (SC-003)', async () => {
    const scope = { from: FROM, to: TO, projectId: SEED_PROJECT_ID };
    const [led, ov] = await tenant.run(CTX, () =>
      Promise.all([provider.getLedger(scope), overviewProvider.getOverview(scope)]),
    );
    expect(led.totalSeconds).toBe(ov.totals.interruptionSeconds);
  });
});
