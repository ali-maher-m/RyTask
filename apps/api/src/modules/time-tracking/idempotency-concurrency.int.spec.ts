import {
  timers,
  type DbHandle,
  SEED_ORG_ID,
  SEED_TIMER_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { and, eq } from 'drizzle-orm';
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
import { TimeLogsRepository } from './repositories/time-logs.repository';
import { TimersRepository } from './repositories/timers.repository';

/**
 * Idempotency + concurrency hardening against REAL PostgreSQL (T080, time-tracking-flow.md §6,
 * SC-002/SC-007):
 *  - a replayed stop / manual-create with the same `Idempotency-Key` writes EXACTLY one entry;
 *  - two CONCURRENT starts for one user yield EXACTLY one active timer — the `UNIQUE(org,user)`
 *    constraint is the real guard (the losing racer's insert violates it and resolves to the winner),
 *    so no sequence of starts ever produces two active timers.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';

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

describe('Time idempotency & concurrency (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let start: StartTimerProvider;
  let stop: StopTimerProvider;
  let create: CreateTimeLogProvider;
  let timersRepo: TimersRepository;
  let timeLogs: TimeLogsRepository;
  let now: Date;
  const clock: Clock = { now: () => now };

  const wireAccess = () =>
    new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );

  /** Count the user's running timers directly (the invariant target — must never exceed 1). */
  const activeTimerCount = () =>
    handle.db
      .select()
      .from(timers)
      .where(and(eq(timers.organizationId, SEED_ORG_ID), eq(timers.userId, SEED_USER_ID)))
      .then((rows) => rows.length);

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timersRepo = new TimersRepository(handle.db, tenant);
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    const idem = new IdempotencyService(new FakeRedis() as unknown as Redis, tenant);
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    start = new StartTimerProvider(timersRepo, wireAccess(), projects, clock, idem, tenant);
    stop = new StopTimerProvider(timersRepo, wireAccess(), clock, idem, tenant);
    create = new CreateTimeLogProvider(timeLogs, wireAccess(), projects, clock, idem, tenant);
    now = new Date('2026-06-09T09:00:00.000Z');
    await tenant.run(CTX, () => timersRepo.delete(SEED_TIMER_ID)); // clean slate
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('two concurrent starts for one user yield exactly one active timer', async () => {
    const [a, b] = await Promise.all([
      tenant.run(CTX, () => start.start(RY_1, null, undefined)),
      tenant.run(CTX, () => start.start(RY_1, null, undefined)),
    ]);
    // Both resolve to the SAME running timer (the loser caught the unique violation).
    expect(a.id).toBe(b.id);
    expect(await activeTimerCount()).toBe(1);
  });

  it('a replayed stop with the same key writes exactly one entry', async () => {
    now = new Date('2026-06-09T09:40:00.000Z');
    const timer = await tenant.run(CTX, () => timersRepo.findActiveForUser(SEED_USER_ID));
    const first = await tenant.run(CTX, () => stop.stop(timer?.id ?? '', 'idem-stop-x'));
    const replay = await tenant.run(CTX, () => stop.stop(timer?.id ?? '', 'idem-stop-x'));
    expect(replay.id).toBe(first.id);
    const matches = await tenant.run(CTX, () =>
      timeLogs.listForItem(RY_1).then((rows) => rows.filter((r) => r.id === first.id)),
    );
    expect(matches).toHaveLength(1);
    expect(await activeTimerCount()).toBe(0); // the stop cleared the timer
  });

  it('a replayed manual create with the same key writes exactly one entry', async () => {
    const first = await tenant.run(CTX, () =>
      create.create(RY_1, { durationSeconds: 777, note: 'dup-guard' }, 'idem-create-x'),
    );
    const replay = await tenant.run(CTX, () =>
      create.create(RY_1, { durationSeconds: 777, note: 'dup-guard' }, 'idem-create-x'),
    );
    expect(replay.id).toBe(first.id);
    const matches = await tenant.run(CTX, () =>
      timeLogs.listForItem(RY_1).then((rows) => rows.filter((r) => r.durationSeconds === 777)),
    );
    expect(matches).toHaveLength(1);
  });
});
