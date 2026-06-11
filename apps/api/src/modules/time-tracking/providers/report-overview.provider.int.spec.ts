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
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { ReportOverviewProvider } from './report-overview.provider';

/**
 * Integration test for the flagship overview read-model against REAL PostgreSQL (US1, T010, SC-002).
 * Known entries across two ISO weeks / two items roll up so the headline split, the per-week table
 * (zero weeks included), and the top-items list all equal the hand-computed sums and reconcile
 * (`planned + interruption === logged`). Soft-deleted entries AND entries on trashed items are
 * excluded everywhere (research D10); visibility is scoped to readable projects (FR-013).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const RY_2 = '0193b3a0-0000-7000-8000-000000000021';
// Two days in two consecutive ISO weeks (Mondays 2026-06-01 and 2026-06-08).
const W1_DAY = '2026-06-03'; // Wed, week of 2026-06-01
const W2_DAY = '2026-06-10'; // Wed, week of 2026-06-08
const FROM = '2026-06-01';
const TO = '2026-06-21'; // spans three ISO weeks; 2026-06-15 has no data → a zero row

const TRASH_ITEM = '0193b3a0-0000-7000-8000-0000000000a1';
const PROJ_2 = '0193b3a0-0000-7000-8000-0000000000a2';
const PROJ_2_STATUS = '0193b3a0-0000-7000-8000-0000000000a3';
const PROJ_2_ITEM = '0193b3a0-0000-7000-8000-0000000000a4';
const MEMBER_USER = '0193b3a0-0000-7000-8000-0000000000a5';

const entry = (
  workItemId: string,
  day: string,
  durationSeconds: number,
  classification: 'PLANNED' | 'INTERRUPTION',
  projectId = SEED_PROJECT_ID,
) => ({
  workspaceId: SEED_WORKSPACE_ID,
  projectId,
  workItemId,
  userId: SEED_USER_ID,
  startedAt: new Date(`${day}T09:00:00.000Z`),
  endedAt: new Date(`${day}T09:00:00.000Z`),
  durationSeconds,
  source: 'MANUAL' as const,
  classification,
});

describe('ReportOverviewProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let provider: ReportOverviewProvider;

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
    provider = new ReportOverviewProvider(timeLogs, projectsAccess);

    // A trashed item + a member-only user + a second unreadable project.
    await handle.db.insert(users).values({
      id: MEMBER_USER,
      organizationId: SEED_ORG_ID,
      email: 'member@rytask.local',
      name: 'Mem',
    });
    await handle.db.insert(workItems).values({
      id: TRASH_ITEM,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      projectId: SEED_PROJECT_ID,
      number: 900,
      title: 'Trashed item',
      statusId: SEED_STATUS_IDS.todo,
    });
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
    });
    await handle.db.insert(projectMembers).values({
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      userId: MEMBER_USER,
      role: 'MEMBER',
    });

    await tenant.run(CTX, async () => {
      // Clean slate: drop the four seeded demo logs.
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      // RY_1: 1h + 2h planned (two weeks). RY_2: 30m interruption (w1) + 10m planned (w2).
      await timeLogs.create(entry(RY_1, W1_DAY, 3600, 'PLANNED'));
      await timeLogs.create(entry(RY_1, W2_DAY, 7200, 'PLANNED'));
      await timeLogs.create(entry(RY_2, W1_DAY, 1800, 'INTERRUPTION'));
      await timeLogs.create(entry(RY_2, W2_DAY, 600, 'PLANNED'));
      // A soft-deleted entry (must not count).
      const doomed = await timeLogs.create(entry(RY_1, W1_DAY, 12345, 'PLANNED'));
      await timeLogs.softDelete(doomed.id, new Date());
      // Time on a to-be-trashed item, then trash the item (its time must drop out).
      await timeLogs.create(entry(TRASH_ITEM, W1_DAY, 9999, 'PLANNED'));
      // An entry in the unreadable PROJ_2 (must not appear in a member's org-wide view).
      await timeLogs.create(entry(PROJ_2_ITEM, W1_DAY, 4444, 'PLANNED', PROJ_2));
    });
    // Trash the item AFTER logging on it.
    await handle.db
      .update(workItems)
      .set({ deletedAt: new Date() })
      .where(eq(workItems.id, TRASH_ITEM));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('totals reconcile and equal the seeded sums (planned + interruption === logged)', async () => {
    const r = await tenant.run(CTX, () =>
      provider.getOverview({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    expect(r.range).toEqual({ from: FROM, to: TO });
    expect(r.totals).toEqual({
      loggedSeconds: 13200,
      plannedSeconds: 11400,
      interruptionSeconds: 1800,
    });
    expect(r.totals.plannedSeconds + r.totals.interruptionSeconds).toBe(r.totals.loggedSeconds);
  });

  it('per-week rows are ascending, reconcile, and include the empty week as a zero row', async () => {
    const r = await tenant.run(CTX, () =>
      provider.getOverview({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    expect(r.weeks.map((w) => w.weekStart)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15']);
    const w1 = r.weeks.find((w) => w.weekStart === '2026-06-01');
    const w2 = r.weeks.find((w) => w.weekStart === '2026-06-08');
    const w3 = r.weeks.find((w) => w.weekStart === '2026-06-15');
    expect(w1).toMatchObject({
      loggedSeconds: 5400,
      plannedSeconds: 3600,
      interruptionSeconds: 1800,
    });
    expect(w2).toMatchObject({ loggedSeconds: 7800, plannedSeconds: 7800, interruptionSeconds: 0 });
    expect(w3).toMatchObject({ loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 });
    expect(r.weeks.reduce((s, w) => s + w.loggedSeconds, 0)).toBe(r.totals.loggedSeconds);
  });

  it('top items are descending by logged seconds, excluding trashed-item time', async () => {
    const r = await tenant.run(CTX, () =>
      provider.getOverview({ from: FROM, to: TO, projectId: SEED_PROJECT_ID }),
    );
    expect(r.topItems.map((t) => t.workItemId)).toEqual([RY_1, RY_2]);
    expect(r.topItems[0]?.loggedSeconds).toBe(10800);
    // The trashed item (9999s) and the soft-deleted entry (12345s) never appear.
    expect(r.topItems.some((t) => t.loggedSeconds === 9999 || t.loggedSeconds === 12345)).toBe(
      false,
    );
  });

  it('a supplied projectId the caller cannot view is rejected (assertRole VIEWER)', async () => {
    const memberCtx = { ...CTX, userId: MEMBER_USER };
    await expect(
      tenant.run(memberCtx, () => provider.getOverview({ from: FROM, to: TO, projectId: PROJ_2 })),
    ).rejects.toThrow();
  });

  it('an org-wide call by a member excludes time from projects they cannot read', async () => {
    const memberCtx = { ...CTX, userId: MEMBER_USER };
    const r = await tenant.run(memberCtx, () => provider.getOverview({ from: FROM, to: TO }));
    // The member reads SEED_PROJECT (13200s) but never PROJ_2's 4444s.
    expect(r.totals.loggedSeconds).toBe(13200);
  });
});
