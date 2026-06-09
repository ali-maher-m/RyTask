import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_TIME_LOG_IDS,
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
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { TimeRollupProvider } from './time-rollup.provider';

/**
 * Integration test against REAL PostgreSQL (T030, data-model §4.1). Proves the per-item rollup:
 * `SUM(duration_seconds) GROUP BY work_item_id`, tenant-scoped, excluding soft-deleted logs AND logs
 * of soft-deleted items. The seed logs RY-1 = 2h + 1h15m = 11700s, RY-2 = 1h30m + 1h = 9000s; RY-3
 * has only a running timer (no finalized entry), so it never appears in the rollup.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const RY_2 = '0193b3a0-0000-7000-8000-000000000021';
const RY_3 = '0193b3a0-0000-7000-8000-000000000022';

const asMap = (rows: { workItemId: string; loggedSeconds: number }[]) =>
  new Map(rows.map((r) => [r.workItemId, r.loggedSeconds]));

describe('TimeRollupProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: TimeRollupProvider;
  let timeLogs: TimeLogsRepository;
  let workItems: WorkItemsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    workItems = new WorkItemsRepository(handle.db, tenant);
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new TimeRollupProvider(timeLogs, projects);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('sums logged seconds per item; an item with only a running timer is absent', async () => {
    const rows = await tenant.run(CTX, () => provider.getProjectRollup(SEED_PROJECT_ID));
    const totals = asMap(rows);
    expect(totals.get(RY_1)).toBe(11700);
    expect(totals.get(RY_2)).toBe(9000);
    expect(totals.has(RY_3)).toBe(false);
  });

  it('excludes a soft-deleted log from its item total', async () => {
    await tenant.run(CTX, () => timeLogs.softDelete(SEED_TIME_LOG_IDS.underB, new Date()));
    const totals = asMap(await tenant.run(CTX, () => provider.getProjectRollup(SEED_PROJECT_ID)));
    expect(totals.get(RY_1)).toBe(7200); // 11700 − 4500
  });

  it('excludes logs of a soft-deleted item entirely', async () => {
    await tenant.run(CTX, () => workItems.softDelete(RY_2, SEED_USER_ID));
    const totals = asMap(await tenant.run(CTX, () => provider.getProjectRollup(SEED_PROJECT_ID)));
    expect(totals.has(RY_2)).toBe(false);
  });
});
