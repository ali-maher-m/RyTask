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
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import { TimersRepository } from '../repositories/timers.repository';
import { StartTimerProvider } from './start-timer.provider';

/**
 * Integration test against REAL PostgreSQL (T019, §14.1). Proves the start lifecycle: an idle start
 * inserts a single running timer (no entry yet), starting on the same item is a no-op, and switching
 * to another item finalizes the prior accrual into a `time_log` (`source = TIMER`) in one transaction.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
const RY_2 = '0193b3a0-0000-7000-8000-000000000021';

// No Idempotency-Key is passed in these specs, so `IdempotencyService.run` calls fn() without Redis.
const noRedis = {} as unknown as Redis;

describe('StartTimerProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: StartTimerProvider;
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
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new StartTimerProvider(
      timers,
      access,
      projects,
      clock,
      new IdempotencyService(noRedis, tenant),
      tenant,
    );
    // Start from a clean slate: drop the seed's running timer so the first start is an idle start.
    now = new Date('2026-06-09T12:00:00.000Z');
    await tenant.run(CTX, () => timers.delete(SEED_TIMER_ID));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('idle start inserts one running timer and records no entry', async () => {
    const active = await tenant.run(CTX, () => provider.start(RY_1, 'focus', undefined));
    expect(active.workItemId).toBe(RY_1);
    expect(active.startedAt).toBe('2026-06-09T12:00:00.000Z');

    const row = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    expect(row?.workItemId).toBe(RY_1);
    // No finalized entry exists yet — a timer accrues; only stop/switch writes a time_log.
    const ry1New = await tenant.run(CTX, () => timeLogs.listForItem(RY_1));
    expect(ry1New.some((l) => l.durationSeconds === 1800)).toBe(false);
  });

  it('starting on the SAME item is a no-op (returns the running timer, no new entry)', async () => {
    const before = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    const again = await tenant.run(CTX, () => provider.start(RY_1, null, undefined));
    expect(again.id).toBe(before?.id);
    expect(again.startedAt).toBe('2026-06-09T12:00:00.000Z'); // elapsed not reset
  });

  it('switching to another item finalizes the prior accrual into a TIMER time_log', async () => {
    now = new Date('2026-06-09T12:30:00.000Z'); // 30 minutes later
    const active = await tenant.run(CTX, () => provider.start(RY_2, null, undefined));
    expect(active.workItemId).toBe(RY_2);
    expect(active.startedAt).toBe('2026-06-09T12:30:00.000Z');

    // Exactly one active timer remains, now on RY-2.
    const row = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    expect(row?.workItemId).toBe(RY_2);

    // The prior RY-1 accrual was finalized: 30m = 1800s, source TIMER.
    const ry1 = await tenant.run(CTX, () => timeLogs.listForItem(RY_1));
    const finalized = ry1.find((l) => l.durationSeconds === 1800);
    expect(finalized).toBeDefined();
    expect(finalized?.source).toBe('TIMER');
    expect(finalized?.userId).toBe(SEED_USER_ID);
  });
});
