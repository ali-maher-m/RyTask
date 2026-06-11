import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  projectCounters,
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
import { ActivityRepository } from '../repositories/activity.repository';
import { WorkItemWatchersRepository } from '../repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from './work-item-access.service';

/**
 * Integration test for `WORK_ITEM_ACCESS.listCompletedForUser` against REAL PostgreSQL (M4 US3, T034,
 * research D6). Returns non-deleted items assigned to the subject whose `completed_at` falls inside the
 * inclusive `[from, to]` UTC window ∩ readable projects — newest completion first. The `listDueAndOverdue`
 * lifecycle-read precedent: zero `time_logs` involvement, fully tenant-scoped.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const WEEK_FROM = '2026-06-08'; // Monday
const WEEK_TO = '2026-06-14'; // Sunday

const OTHER_USER = '0193b3a0-0000-7000-8000-0000000000c8';
const PROJ_2 = '0193b3a0-0000-7000-8000-0000000000c9';
const PROJ_2_STATUS = '0193b3a0-0000-7000-8000-0000000000ca';

const item = (
  id: string,
  number: number,
  opts: {
    assigneeId?: string | null;
    completedAt?: Date | null;
    deletedAt?: Date | null;
    projectId?: string;
    statusId?: string;
    title?: string;
  },
) => ({
  id,
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  projectId: opts.projectId ?? SEED_PROJECT_ID,
  number,
  title: opts.title ?? `Item ${number}`,
  statusId: opts.statusId ?? SEED_STATUS_IDS.todo,
  assigneeId: opts.assigneeId ?? SEED_USER_ID,
  completedAt: opts.completedAt ?? null,
  deletedAt: opts.deletedAt ?? null,
});

describe('WorkItemAccessService.listCompletedForUser (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let access: WorkItemAccessServiceImpl;

  const IN_WEEK = '0193b3a0-0000-7000-8000-0000000000d1';
  const ON_MONDAY = '0193b3a0-0000-7000-8000-0000000000d2';
  const BEFORE_WEEK = '0193b3a0-0000-7000-8000-0000000000d3';
  const AFTER_WEEK = '0193b3a0-0000-7000-8000-0000000000d4';
  const OTHER_ASSIGNEE = '0193b3a0-0000-7000-8000-0000000000d5';
  const DELETED = '0193b3a0-0000-7000-8000-0000000000d6';
  const IN_PROJ_2 = '0193b3a0-0000-7000-8000-0000000000d7';

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    access = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );

    await handle.db.insert(users).values({
      id: OTHER_USER,
      organizationId: SEED_ORG_ID,
      email: 'other@rytask.local',
      name: 'Other',
    });
    await handle.db.insert(projects).values({
      id: PROJ_2,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: 'Side',
      keyPrefix: 'SID',
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

    await handle.db.insert(workItems).values([
      item(IN_WEEK, 850, { completedAt: new Date('2026-06-10T12:00:00.000Z'), title: 'Mid-week' }),
      item(ON_MONDAY, 851, { completedAt: new Date('2026-06-08T00:00:00.000Z'), title: 'Monday' }),
      item(BEFORE_WEEK, 852, { completedAt: new Date('2026-06-07T23:59:59.000Z') }),
      item(AFTER_WEEK, 853, { completedAt: new Date('2026-06-15T00:00:00.000Z') }),
      item(OTHER_ASSIGNEE, 854, {
        completedAt: new Date('2026-06-10T12:00:00.000Z'),
        assigneeId: OTHER_USER,
      }),
      item(DELETED, 855, {
        completedAt: new Date('2026-06-10T12:00:00.000Z'),
        deletedAt: new Date(),
      }),
      item(IN_PROJ_2, 1, {
        completedAt: new Date('2026-06-10T12:00:00.000Z'),
        projectId: PROJ_2,
        statusId: PROJ_2_STATUS,
        title: 'Side project',
      }),
    ]);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('returns only in-window, assigned, non-deleted items in the given projects, newest first', async () => {
    const rows = await tenant.run(CTX, () =>
      access.listCompletedForUser(SEED_USER_ID, WEEK_FROM, WEEK_TO, [SEED_PROJECT_ID]),
    );
    // IN_WEEK (06-10) then ON_MONDAY (06-08), descending by completed_at.
    expect(rows.map((r) => r.workItemId)).toEqual([IN_WEEK, ON_MONDAY]);
    expect(rows[0]).toMatchObject({ projectId: SEED_PROJECT_ID, title: 'Mid-week' });
    expect(rows[0]?.key).toMatch(/-850$/);
    expect(typeof rows[0]?.completedAt).toBe('string');
  });

  it('excludes before/after the window, other assignees, deleted, and out-of-scope projects', async () => {
    const ids = await tenant.run(CTX, () =>
      access
        .listCompletedForUser(SEED_USER_ID, WEEK_FROM, WEEK_TO, [SEED_PROJECT_ID])
        .then((rows) => rows.map((r) => r.workItemId)),
    );
    for (const excluded of [BEFORE_WEEK, AFTER_WEEK, OTHER_ASSIGNEE, DELETED, IN_PROJ_2]) {
      expect(ids).not.toContain(excluded);
    }
  });

  it('includes every readable project when projectIds is null', async () => {
    const ids = await tenant.run(CTX, () =>
      access
        .listCompletedForUser(SEED_USER_ID, WEEK_FROM, WEEK_TO, null)
        .then((rows) => rows.map((r) => r.workItemId)),
    );
    expect(ids).toContain(IN_PROJ_2);
    expect(ids).toContain(IN_WEEK);
  });
});
