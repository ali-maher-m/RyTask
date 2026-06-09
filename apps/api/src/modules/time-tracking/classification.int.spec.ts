import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_TIMER_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import type { Clock } from '../../common/ports/clock.port';
import { TenantContextService } from '../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../common/testing/postgres';
import { ProjectMembersRepository } from '../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../projects/services/project-access.service';
import { ActivityRepository } from '../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../work-items/services/work-item-access.service';
import { CreateTimeLogProvider } from './providers/create-time-log.provider';
import { StartTimerProvider } from './providers/start-timer.provider';
import { StopTimerProvider } from './providers/stop-timer.provider';
import { UpdateTimeLogProvider } from './providers/update-time-log.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';
import { TimersRepository } from './repositories/timers.repository';

/**
 * Classification integration test against REAL PostgreSQL (T061, time-tracking-flow.md §4, SC-005):
 *  - derive-and-snapshot on create (URGENT⇒INTERRUPTION, normal⇒PLANNED) and on a stopped timer;
 *  - an explicit class on create, and an edit, set `classificationOverridden`;
 *  - a LATER change to the item's priority does NOT re-split already-logged history (the snapshot holds);
 *  - planned + interruption reconcile EXACTLY to the item total (the two-value invariant).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020'; // seeded MEDIUM → planned baseline
const RY_2 = '0193b3a0-0000-7000-8000-000000000021'; // seeded HIGH → set URGENT below

/** Minimal in-memory Redis with `SET NX` semantics — enough for `IdempotencyService` under test. */
class FakeRedis {
  private store = new Map<string, string>();
  async set(key: string, val: string, ...args: unknown[]): Promise<'OK' | null> {
    if (args[args.length - 1] === 'NX' && this.store.has(key)) return null;
    this.store.set(key, val);
    return 'OK';
  }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('Classification (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let create: CreateTimeLogProvider;
  let update: UpdateTimeLogProvider;
  let start: StartTimerProvider;
  let stop: StopTimerProvider;
  let timers: TimersRepository;
  let timeLogs: TimeLogsRepository;
  let now: Date;
  const clock: Clock = { now: () => now };

  /** Set a work item's priority directly (test setup — proves the snapshot ignores later changes). */
  const setPriority = (id: string, priority: 'URGENT' | 'LOW') =>
    handle.db.update(workItems).set({ priority }).where(eq(workItems.id, id));

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timers = new TimersRepository(handle.db, tenant);
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
    const idem = new IdempotencyService(new FakeRedis() as unknown as Redis, tenant);
    create = new CreateTimeLogProvider(timeLogs, access, projects, clock, idem, tenant);
    update = new UpdateTimeLogProvider(timeLogs, access, clock, tenant);
    start = new StartTimerProvider(timers, access, projects, clock, idem, tenant);
    stop = new StopTimerProvider(timers, access, clock, idem, tenant);
    now = new Date('2026-06-09T09:00:00.000Z');
    await tenant.run(CTX, () => timers.delete(SEED_TIMER_ID)); // clean slate for the start/stop case
    await setPriority(RY_2, 'URGENT');
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('derives INTERRUPTION on create for an URGENT item (snapshotted, not overridden)', async () => {
    const log = await tenant.run(CTX, () => create.create(RY_2, { durationSeconds: 1800 }));
    expect(log.classification).toBe('INTERRUPTION');
    expect(log.classificationOverridden).toBe(false);
  });

  it('derives PLANNED on create for a non-urgent item', async () => {
    const log = await tenant.run(CTX, () => create.create(RY_1, { durationSeconds: 1800 }));
    expect(log.classification).toBe('PLANNED');
    expect(log.classificationOverridden).toBe(false);
  });

  it('snapshots the derived class when a timer is stopped (URGENT ⇒ INTERRUPTION)', async () => {
    await tenant.run(CTX, () => start.start(RY_2, null, undefined));
    now = new Date('2026-06-09T09:20:00.000Z');
    const timer = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    const log = await tenant.run(CTX, () => stop.stop(timer?.id ?? '', undefined));
    expect(log.source).toBe('TIMER');
    expect(log.classification).toBe('INTERRUPTION');
    expect(log.classificationOverridden).toBe(false);
  });

  it('honors an explicit class on create and marks it overridden (against the URGENT default)', async () => {
    const log = await tenant.run(CTX, () =>
      create.create(RY_2, { durationSeconds: 600, classification: 'PLANNED' }),
    );
    expect(log.classification).toBe('PLANNED');
    expect(log.classificationOverridden).toBe(true);
  });

  it('an edit can override the class and sets classificationOverridden', async () => {
    const created = await tenant.run(CTX, () => create.create(RY_1, { durationSeconds: 900 }));
    expect(created.classificationOverridden).toBe(false);
    const edited = await tenant.run(CTX, () =>
      update.update(created.id, { classification: 'INTERRUPTION' }),
    );
    expect(edited.classification).toBe('INTERRUPTION');
    expect(edited.classificationOverridden).toBe(true);
  });

  it('a later item-priority change does NOT re-split already-logged history', async () => {
    const log = await tenant.run(CTX, () => create.create(RY_2, { durationSeconds: 1200 }));
    expect(log.classification).toBe('INTERRUPTION'); // RY_2 is URGENT now
    // The item calms down later — the snapshot must hold; the entry stays an interruption.
    await setPriority(RY_2, 'LOW');
    const reread = await tenant.run(CTX, () => timeLogs.findById(log.id));
    expect(reread?.classification).toBe('INTERRUPTION');
    await setPriority(RY_2, 'URGENT'); // restore for any later assertions
  });

  it('planned + interruption reconcile exactly to the item total', async () => {
    const rows = await tenant.run(CTX, () => timeLogs.listForItem(RY_2));
    const total = rows.reduce((sum, r) => sum + r.durationSeconds, 0);
    const planned = rows
      .filter((r) => r.classification === 'PLANNED')
      .reduce((sum, r) => sum + r.durationSeconds, 0);
    const interruption = rows
      .filter((r) => r.classification === 'INTERRUPTION')
      .reduce((sum, r) => sum + r.durationSeconds, 0);
    expect(planned + interruption).toBe(total);
  });
});
