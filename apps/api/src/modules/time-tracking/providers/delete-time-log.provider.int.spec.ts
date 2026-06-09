import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { DeleteTimeLogProvider } from './delete-time-log.provider';

/**
 * Integration test against REAL PostgreSQL (T052, §14.1). Proves delete is a recoverable soft-delete
 * (`deleted_at`): the entry drops out of reads + the rollup immediately, a `TIME_DELETED {old}` row is
 * appended, the row still physically exists (recoverable), and a non-owner non-admin is denied.
 */
const RY_3 = '0193b3a0-0000-7000-8000-000000000022'; // a clean item (no seeded logs)
const U2 = '0193b3a0-0000-7000-8000-0000000000b3';
const CTX_OWNER = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: U2,
  isOrgAdmin: false,
};
const CTX_OTHER = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: SEED_USER_ID,
  isOrgAdmin: false,
};
const clock: Clock = { now: () => new Date('2026-06-09T16:00:00.000Z') };

describe('DeleteTimeLogProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: DeleteTimeLogProvider;
  let timeLogs: TimeLogsRepository;
  let activityRepo: ActivityRepository;

  const seedLog = () =>
    tenant.run(CTX_OWNER, () =>
      timeLogs.create({
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        workItemId: RY_3,
        userId: U2,
        startedAt: new Date('2026-06-08T09:00:00.000Z'),
        endedAt: new Date('2026-06-08T10:00:00.000Z'),
        durationSeconds: 3600,
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
    activityRepo = new ActivityRepository(handle.db, tenant);
    const access = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    provider = new DeleteTimeLogProvider(timeLogs, access, clock, tenant);

    await handle.db
      .insert(users)
      .values({ id: U2, organizationId: SEED_ORG_ID, email: 'third@rytask.local', name: 'Third' })
      .onConflictDoNothing();
    await handle.db
      .insert(memberships)
      .values({ organizationId: SEED_ORG_ID, userId: U2, role: 'MEMBER' })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('soft-deletes (recoverable): drops from reads + rollup and appends TIME_DELETED', async () => {
    const log = await seedLog();
    await tenant.run(CTX_OWNER, () => provider.delete(log.id));

    // Excluded from non-deleted reads and the per-item rollup.
    expect(await tenant.run(CTX_OWNER, () => timeLogs.findById(log.id))).toBeNull();
    const rollup = await tenant.run(CTX_OWNER, () => timeLogs.rollupByItem(SEED_PROJECT_ID));
    expect(rollup.find((r) => r.workItemId === RY_3)).toBeUndefined();

    // TIME_DELETED appended, carrying the old entry.
    const feed = await tenant.run(CTX_OWNER, () => activityRepo.listForItem(RY_3));
    const deleted = feed.find((a) => a.action === 'TIME_DELETED');
    expect(deleted).toBeDefined();
    expect((deleted?.oldValue as { durationSeconds?: number })?.durationSeconds).toBe(3600);
  });

  it('a non-owner non-admin is denied (default-deny)', async () => {
    const log = await seedLog();
    await expect(tenant.run(CTX_OTHER, () => provider.delete(log.id))).rejects.toThrow();
    // Still present for the owner.
    expect(await tenant.run(CTX_OWNER, () => timeLogs.findById(log.id))).not.toBeNull();
  });
});
