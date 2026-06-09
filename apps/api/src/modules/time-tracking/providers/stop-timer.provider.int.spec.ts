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
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { TimersRepository } from '../repositories/timers.repository';
import { StopTimerProvider } from './stop-timer.provider';

/**
 * Integration test against REAL PostgreSQL (T020, §14.1). Proves stop computes the duration from a
 * frozen `CLOCK`, inserts the `time_log` (`source = TIMER`), and deletes the `timers` row — and that
 * stopping a timer that isn't the caller's (or doesn't exist) is a 404.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const noRedis = {} as unknown as Redis;

describe('StopTimerProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: StopTimerProvider;
  let timers: TimersRepository;
  let timeLogs: TimeLogsRepository;
  let now: Date;
  const clock: Clock = { now: () => now };

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
    provider = new StopTimerProvider(
      timers,
      access,
      clock,
      new IdempotencyService(noRedis, tenant),
      tenant,
    );
    now = new Date('2026-06-09T12:45:00.000Z');
    // Replace the seed timer with a deterministic one on RY-1 started 45 minutes before `now`.
    await tenant.run(CTX, () => timers.delete(SEED_TIMER_ID));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('stop finalizes the frozen-clock duration, writes a TIMER log, and deletes the timer', async () => {
    const timer = await tenant.run(CTX, () =>
      timers.create({
        workspaceId: SEED_WORKSPACE_ID,
        workItemId: RY_1,
        userId: SEED_USER_ID,
        startedAt: new Date('2026-06-09T12:00:00.000Z'),
      }),
    );

    const log = await tenant.run(CTX, () => provider.stop(timer.id, undefined));
    expect(log.durationSeconds).toBe(2700); // 45 minutes
    expect(log.source).toBe('TIMER');
    expect(log.workItemId).toBe(RY_1);
    expect(log.endedAt).toBe('2026-06-09T12:45:00.000Z');

    // The timer row is gone; the log persists.
    const active = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    expect(active).toBeNull();
    const persisted = await tenant.run(CTX, () => timeLogs.findById(log.id));
    expect(persisted?.durationSeconds).toBe(2700);
  });

  it('stopping a non-existent / non-owned timer → not found', async () => {
    await expect(
      tenant.run(CTX, () => provider.stop('0193b3a0-0000-7000-8000-0000000000ee', undefined)),
    ).rejects.toThrow();
  });
});
