import type { TimeSummaryRow } from '@rytask/contracts';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { TimeSummaryProvider } from './time-summary.provider';

/**
 * Time-summary reconciliation integration test against REAL PostgreSQL (T072, time-tracking-flow.md §8,
 * SC-005): known entries across two items / two days roll up so that EVERY grouping (item / user /
 * project / period) equals the exact hand-computed sum, the planned/interruption split reconciles
 * (`planned + interruption === logged`) on every row, and an edit updates every affected total
 * consistently. The four seeded demo logs are soft-deleted first so the arithmetic is exact.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const RY_2 = '0193b3a0-0000-7000-8000-000000000021';
const DAY_1 = '2026-06-01';
const DAY_2 = '2026-06-02';

/** Build a finalized-log insert for the repo (one clean entry on a given day). */
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

describe('TimeSummaryProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let timeLogs: TimeLogsRepository;
  let provider: TimeSummaryProvider;
  /** A handle for asserting reconciliation: every row's planned+interruption equals its logged. */
  const reconciles = (rows: TimeSummaryRow[]) =>
    rows.every((r) => r.plannedSeconds + r.interruptionSeconds === r.loggedSeconds);
  const byKey = (rows: TimeSummaryRow[], key: string) => rows.find((r) => r.key === key);

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new TimeSummaryProvider(timeLogs, projects);

    await tenant.run(CTX, async () => {
      // Clean slate: drop the four seeded demo logs out of every aggregation.
      for (const id of Object.values(SEED_TIME_LOG_IDS)) {
        await timeLogs.softDelete(id, new Date());
      }
      // Known entries: RY-1 logs 1h (planned) + 2h (planned); RY-2 logs 30m (interruption) + 10m (planned).
      await timeLogs.create(entry(RY_1, DAY_1, 3600, 'PLANNED'));
      await timeLogs.create(entry(RY_1, DAY_2, 7200, 'PLANNED'));
      await timeLogs.create(entry(RY_2, DAY_1, 1800, 'INTERRUPTION'));
      await timeLogs.create(entry(RY_2, DAY_2, 600, 'PLANNED'));
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('per-item totals equal the exact sum of contributing entries (split reconciles)', async () => {
    const rows = await tenant.run(CTX, () => provider.getSummary({ groupBy: 'item' }));
    expect(byKey(rows, RY_1)?.loggedSeconds).toBe(10800); // 3600 + 7200
    expect(byKey(rows, RY_2)?.loggedSeconds).toBe(2400); // 1800 + 600
    expect(reconciles(rows)).toBe(true);
    // RY-2 carries both classes; RY-1 is entirely planned.
    expect(byKey(rows, RY_2)?.interruptionSeconds).toBe(1800);
    expect(byKey(rows, RY_1)?.interruptionSeconds).toBe(0);
  });

  it('per-project total equals the sum of all its items', async () => {
    const rows = await tenant.run(CTX, () => provider.getSummary({ groupBy: 'project' }));
    const proj = byKey(rows, SEED_PROJECT_ID);
    expect(proj?.loggedSeconds).toBe(13200); // 10800 + 2400
    expect(proj?.plannedSeconds).toBe(11400); // 3600 + 7200 + 600
    expect(proj?.interruptionSeconds).toBe(1800);
    expect(reconciles(rows)).toBe(true);
  });

  it('per-period (day) totals bucket by start day and reconcile', async () => {
    const rows = await tenant.run(CTX, () =>
      provider.getSummary({ groupBy: 'period', period: 'day' }),
    );
    expect(byKey(rows, DAY_1)?.loggedSeconds).toBe(5400); // 3600 + 1800
    expect(byKey(rows, DAY_2)?.loggedSeconds).toBe(7800); // 7200 + 600
    expect(byKey(rows, DAY_1)?.interruptionSeconds).toBe(1800);
    expect(reconciles(rows)).toBe(true);
  });

  it('the "my time" query (groupBy=user, userId=me) totals the user exactly', async () => {
    const rows = await tenant.run(CTX, () =>
      provider.getSummary({ groupBy: 'user', userId: SEED_USER_ID }),
    );
    expect(rows).toHaveLength(1);
    expect(byKey(rows, SEED_USER_ID)?.loggedSeconds).toBe(13200);
    expect(reconciles(rows)).toBe(true);
  });

  it('a from/to window narrows the totals to the requested calendar days', async () => {
    const rows = await tenant.run(CTX, () =>
      provider.getSummary({ groupBy: 'project', from: DAY_2, to: DAY_2 }),
    );
    expect(byKey(rows, SEED_PROJECT_ID)?.loggedSeconds).toBe(7800); // only DAY_2 entries
  });

  it('editing an entry updates every affected total consistently', async () => {
    // Grow RY-2's interruption entry from 30m to 1h: project + item + day_1 + interruption all shift +1800.
    const ry2Day1 = await tenant.run(CTX, () =>
      timeLogs.listForItem(RY_2).then((rows) => rows.find((r) => r.durationSeconds === 1800)),
    );
    await tenant.run(CTX, () => timeLogs.update(ry2Day1?.id ?? '', { durationSeconds: 3600 }));

    const items = await tenant.run(CTX, () => provider.getSummary({ groupBy: 'item' }));
    expect(byKey(items, RY_2)?.loggedSeconds).toBe(4200); // 3600 + 600
    expect(byKey(items, RY_2)?.interruptionSeconds).toBe(3600);

    const project = await tenant.run(CTX, () => provider.getSummary({ groupBy: 'project' }));
    expect(byKey(project, SEED_PROJECT_ID)?.loggedSeconds).toBe(15000); // 13200 + 1800
    expect(reconciles(project)).toBe(true);
  });

  /**
   * D3 hardening (FR-013 / SC-007): the org-wide (no-`projectId`) summary path is now restricted to
   * `accessibleProjectIds()`. A non-admin member never sees totals from a project they cannot read; an
   * org admin still sees every project; and a user's own logs in a project they were removed from drop
   * out of their org-wide view. The supplied-`projectId` `assertRole(VIEWER)` behaviour is unchanged.
   */
  describe('org-wide visibility scoping (D3 hardening)', () => {
    // A second project nobody in these tests is a member of — its time must never leak org-wide.
    const PROJ_2 = '0193b3a0-0000-7000-8000-0000000000e1';
    const PROJ_2_STATUS = '0193b3a0-0000-7000-8000-0000000000e2';
    const PROJ_2_ITEM = '0193b3a0-0000-7000-8000-0000000000e3';
    // A plain member of SEED_PROJECT only (not an org admin).
    const MEMBER_USER = '0193b3a0-0000-7000-8000-0000000000e4';
    // A user with a log in SEED_PROJECT who is NOT a member (simulating removal-from-project).
    const REMOVED_USER = '0193b3a0-0000-7000-8000-0000000000e5';
    const MEMBER_CTX = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: MEMBER_USER,
    };
    const ADMIN_CTX = { ...MEMBER_CTX, userId: SEED_USER_ID, isOrgAdmin: true };
    const REMOVED_CTX = { ...MEMBER_CTX, userId: REMOVED_USER };

    beforeAll(async () => {
      await handle.db.insert(users).values([
        { id: MEMBER_USER, organizationId: SEED_ORG_ID, email: 'member@rytask.local', name: 'Mem' },
        {
          id: REMOVED_USER,
          organizationId: SEED_ORG_ID,
          email: 'removed@rytask.local',
          name: 'Rem',
        },
      ]);
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
        title: 'In a project nobody here can read',
        statusId: PROJ_2_STATUS,
      });
      // MEMBER_USER is a member of SEED_PROJECT only.
      await handle.db.insert(projectMembers).values({
        organizationId: SEED_ORG_ID,
        projectId: SEED_PROJECT_ID,
        userId: MEMBER_USER,
        role: 'MEMBER',
      });
      // A distinctive planned entry inside the unreadable PROJ_2…
      await tenant.run(CTX, () =>
        timeLogs.create({
          workspaceId: SEED_WORKSPACE_ID,
          projectId: PROJ_2,
          workItemId: PROJ_2_ITEM,
          userId: SEED_USER_ID,
          startedAt: new Date(`${DAY_1}T09:00:00.000Z`),
          endedAt: new Date(`${DAY_1}T09:00:00.000Z`),
          durationSeconds: 9999,
          source: 'MANUAL',
          classification: 'PLANNED',
        }),
      );
      // …and the removed user's own log inside SEED_PROJECT (on a seeded item).
      await tenant.run(CTX, () =>
        timeLogs.create({
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          workItemId: RY_1,
          userId: REMOVED_USER,
          startedAt: new Date(`${DAY_1}T10:00:00.000Z`),
          endedAt: new Date(`${DAY_1}T10:00:00.000Z`),
          durationSeconds: 5555,
          source: 'MANUAL',
          classification: 'PLANNED',
        }),
      );
    });

    it('a non-admin member’s org-wide totals exclude a project they cannot read', async () => {
      const rows = await tenant.run(MEMBER_CTX, () => provider.getSummary({ groupBy: 'project' }));
      expect(byKey(rows, PROJ_2)).toBeUndefined(); // PROJ_2 never appears
      expect(byKey(rows, SEED_PROJECT_ID)).toBeDefined(); // their own project does
      // The 9999s of PROJ_2 are nowhere in the visible totals.
      expect(rows.every((r) => r.loggedSeconds !== 9999)).toBe(true);
    });

    it('an org admin still sees every project org-wide', async () => {
      const rows = await tenant.run(ADMIN_CTX, () => provider.getSummary({ groupBy: 'project' }));
      expect(byKey(rows, PROJ_2)?.loggedSeconds).toBe(9999);
      expect(byKey(rows, SEED_PROJECT_ID)).toBeDefined();
    });

    it('a user removed from a project no longer sees their own logs there org-wide', async () => {
      const rows = await tenant.run(REMOVED_CTX, () => provider.getSummary({ groupBy: 'project' }));
      // REMOVED_USER is a member of no project → empty org-wide view, even though a log exists.
      expect(rows).toEqual([]);
    });
  });
});
