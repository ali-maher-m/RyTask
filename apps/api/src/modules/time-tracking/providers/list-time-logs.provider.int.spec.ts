import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { ListTimeLogsProvider } from './list-time-logs.provider';

/**
 * Integration test against REAL PostgreSQL (T042, §14.1). Proves the entries list is keyset-paginated
 * (cursor walk, no overlap/gap), newest first by `started_at`, and excludes soft-deleted entries.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_3 = '0193b3a0-0000-7000-8000-000000000022'; // a clean item (no seeded logs)

describe('ListTimeLogsProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: ListTimeLogsProvider;
  let timeLogs: TimeLogsRepository;

  const mk = (startedAtIso: string, durationSeconds: number) =>
    tenant.run(CTX, () =>
      timeLogs.create({
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        workItemId: RY_3,
        userId: SEED_USER_ID,
        startedAt: new Date(startedAtIso),
        endedAt: new Date(new Date(startedAtIso).getTime() + durationSeconds * 1000),
        durationSeconds,
        source: 'MANUAL',
        classification: 'PLANNED',
      }),
    );

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    const access = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new ListTimeLogsProvider(timeLogs, projects, access);

    // Three entries on distinct days, plus a fourth that we soft-delete.
    await mk('2026-06-01T09:00:00.000Z', 100);
    await mk('2026-06-02T09:00:00.000Z', 200);
    await mk('2026-06-03T09:00:00.000Z', 300);
    const doomed = await mk('2026-06-04T09:00:00.000Z', 400);
    await tenant.run(CTX, () => timeLogs.softDelete(doomed.id, new Date()));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('returns non-deleted entries newest-first', async () => {
    const page = await tenant.run(CTX, () => provider.list(RY_3, SEED_USER_ID, 50, null));
    expect(page.data.map((l) => l.durationSeconds)).toEqual([300, 200, 100]);
    expect(page.pageInfo.hasNextPage).toBe(false);
    // The soft-deleted 400s entry never appears.
    expect(page.data.some((l) => l.durationSeconds === 400)).toBe(false);
  });

  it('walks keyset pages without overlap or gap', async () => {
    const first = await tenant.run(CTX, () => provider.list(RY_3, SEED_USER_ID, 2, null));
    expect(first.data.map((l) => l.durationSeconds)).toEqual([300, 200]);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();

    const second = await tenant.run(CTX, () =>
      provider.list(RY_3, SEED_USER_ID, 2, first.pageInfo.nextCursor),
    );
    expect(second.data.map((l) => l.durationSeconds)).toEqual([100]);
    expect(second.pageInfo.hasNextPage).toBe(false);
  });
});
