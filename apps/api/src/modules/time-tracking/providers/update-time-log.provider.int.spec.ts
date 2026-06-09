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
import { UpdateTimeLogProvider } from './update-time-log.provider';

/**
 * Integration test against REAL PostgreSQL (T051, §14.1). Proves edit: the owner edits their own entry,
 * an org admin corrects another user's entry, a duration change is re-validated, and a `TIME_EDITED
 * {old,new}` row is appended to the item activity feed. A non-owner non-admin is denied (default-deny).
 */
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const U2 = '0193b3a0-0000-7000-8000-0000000000b2'; // a second, non-admin user who OWNS the entry
const CTX_OWNER = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: U2,
  isOrgAdmin: false,
};
const CTX_ADMIN = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: SEED_USER_ID,
  isOrgAdmin: true,
};
const CTX_OTHER = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: SEED_USER_ID,
  isOrgAdmin: false,
};
const clock: Clock = { now: () => new Date('2026-06-09T15:00:00.000Z') };

describe('UpdateTimeLogProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: UpdateTimeLogProvider;
  let timeLogs: TimeLogsRepository;
  let activityRepo: ActivityRepository;

  const seedLog = () =>
    tenant.run(CTX_OWNER, () =>
      timeLogs.create({
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        workItemId: RY_1,
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
    provider = new UpdateTimeLogProvider(timeLogs, access, clock, tenant);

    // A second real user (the entry owner) so the activity actor FK + the owner/admin split hold.
    await handle.db
      .insert(users)
      .values({ id: U2, organizationId: SEED_ORG_ID, email: 'second@rytask.local', name: 'Second' })
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

  it('the owner edits their own entry; duration is re-validated and TIME_EDITED is appended', async () => {
    const log = await seedLog();
    const updated = await tenant.run(CTX_OWNER, () =>
      provider.update(log.id, { durationSeconds: 1800, note: 'trimmed' }),
    );
    expect(updated.durationSeconds).toBe(1800);
    expect(updated.note).toBe('trimmed');
    // A duration-only edit keeps the original start and re-derives the end.
    expect(updated.startedAt).toBe('2026-06-08T09:00:00.000Z');
    expect(updated.endedAt).toBe('2026-06-08T09:30:00.000Z');

    const feed = await tenant.run(CTX_OWNER, () => activityRepo.listForItem(RY_1));
    const edited = feed.find((a) => a.action === 'TIME_EDITED');
    expect(edited).toBeDefined();
    expect((edited?.oldValue as { durationSeconds?: number })?.durationSeconds).toBe(3600);
    expect((edited?.newValue as { durationSeconds?: number })?.durationSeconds).toBe(1800);
  });

  it('an org admin can correct another user’s entry', async () => {
    const log = await seedLog();
    const updated = await tenant.run(CTX_ADMIN, () =>
      provider.update(log.id, { note: 'admin fix' }),
    );
    expect(updated.note).toBe('admin fix');
  });

  it('setting classification flips classificationOverridden', async () => {
    const log = await seedLog();
    const updated = await tenant.run(CTX_OWNER, () =>
      provider.update(log.id, { classification: 'INTERRUPTION' }),
    );
    expect(updated.classification).toBe('INTERRUPTION');
    expect(updated.classificationOverridden).toBe(true);
  });

  it('a non-owner non-admin is denied (default-deny), nothing changes', async () => {
    const log = await seedLog();
    await expect(
      tenant.run(CTX_OTHER, () => provider.update(log.id, { note: 'nope' })),
    ).rejects.toThrow();
    const after = await tenant.run(CTX_OWNER, () => timeLogs.findById(log.id));
    expect(after?.note).toBeNull();
  });

  it('an invalid edit (end ≤ start) is rejected', async () => {
    const log = await seedLog();
    await expect(
      tenant.run(CTX_OWNER, () =>
        provider.update(log.id, {
          startedAt: '2026-06-08T10:00:00.000Z',
          endedAt: '2026-06-08T09:00:00.000Z',
        }),
      ),
    ).rejects.toThrow();
  });
});
