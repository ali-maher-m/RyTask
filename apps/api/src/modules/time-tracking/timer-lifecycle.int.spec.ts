import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_TIMER_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
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
import { GetActiveTimerProvider } from './providers/get-active-timer.provider';
import { StartTimerProvider } from './providers/start-timer.provider';
import { StopTimerProvider } from './providers/stop-timer.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';
import { TimersRepository } from './repositories/timers.repository';

/**
 * Timer-lifecycle integration test against REAL PostgreSQL (T022, SC-001/SC-007). Proves the two
 * load-bearing invariants:
 *  - **Server is the source of truth** (FR-TT-009): start → advance the injected `CLOCK` → stop yields
 *    the persisted `durationSeconds`; a SECOND repo/provider set bound to the SAME database (a stand-in
 *    for a page reload / server restart) still sees the running timer with the original `startedAt`.
 *  - **Replay-safe** (FR-X-004): a stop retried with the same `Idempotency-Key` returns the SAME
 *    finalized log — exactly one entry is ever written.
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

describe('Timer lifecycle (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let start: StartTimerProvider;
  let stop: StopTimerProvider;
  let timers: TimersRepository;
  let timeLogs: TimeLogsRepository;
  let now: Date;
  const clock: Clock = { now: () => now };

  const wireAccess = (h: DbHandle, t: TenantContextService) =>
    new WorkItemAccessServiceImpl(
      new WorkItemsRepository(h.db, t),
      new WorkItemWatchersRepository(h.db, t),
      new ActivityRepository(h.db, t),
    );

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timers = new TimersRepository(handle.db, tenant);
    timeLogs = new TimeLogsRepository(handle.db, tenant);
    const idem = new IdempotencyService(new FakeRedis() as unknown as Redis, tenant);
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    start = new StartTimerProvider(
      timers,
      wireAccess(handle, tenant),
      projects,
      clock,
      idem,
      tenant,
    );
    stop = new StopTimerProvider(timers, wireAccess(handle, tenant), clock, idem, tenant);
    now = new Date('2026-06-09T09:00:00.000Z');
    await tenant.run(CTX, () => timers.delete(SEED_TIMER_ID)); // clean slate
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('a running timer survives "reload/restart": a fresh context bound to the same DB re-syncs it', async () => {
    await tenant.run(CTX, () => start.start(RY_1, null, undefined));

    // Stand in for a reload/server restart: a brand-new handle + provider against the same database.
    const handle2 = createDb(pg.url);
    const tenant2 = new TenantContextService();
    const getActive2 = new GetActiveTimerProvider(
      new TimersRepository(handle2.db, tenant2),
      tenant2,
    );
    try {
      const active = await tenant2.run(CTX, () => getActive2.getActive());
      expect(active?.workItemId).toBe(RY_1);
      expect(active?.startedAt).toBe('2026-06-09T09:00:00.000Z'); // original server CLOCK truth
    } finally {
      await handle2.pool.end();
    }
  });

  it('stop persists the frozen-clock duration; replay with the same key yields exactly one entry', async () => {
    now = new Date('2026-06-09T09:50:00.000Z'); // 50 minutes after start
    const timer = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    expect(timer).not.toBeNull();

    const first = await tenant.run(CTX, () => stop.stop(timer?.id ?? '', 'idem-stop-1'));
    expect(first.durationSeconds).toBe(3000);

    // A retried stop with the SAME Idempotency-Key returns the cached log — never a second entry.
    const replay = await tenant.run(CTX, () => stop.stop(timer?.id ?? '', 'idem-stop-1'));
    expect(replay.id).toBe(first.id);

    const entries = await tenant.run(CTX, () => timeLogs.listForItem(RY_1));
    expect(entries.filter((l) => l.durationSeconds === 3000)).toHaveLength(1);
  });
});
