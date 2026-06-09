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
import { CreateTimeLogProvider } from './providers/create-time-log.provider';
import { DeleteTimeLogProvider } from './providers/delete-time-log.provider';
import { StartTimerProvider } from './providers/start-timer.provider';
import { StopTimerProvider } from './providers/stop-timer.provider';
import { UpdateTimeLogProvider } from './providers/update-time-log.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';
import { TimersRepository } from './repositories/timers.repository';

/**
 * Activity-feed integration test against REAL PostgreSQL (T066, activity-and-source.md §1). Proves the
 * *finalize* contract (FR-FIN-001): start / stop / log / edit / delete each append the matching `TIME_*`
 * row to the item's existing M1 activity feed — through the work-items contract's `recordTime*` methods,
 * NEVER by touching `ActivityRepository` from time-tracking (that boundary is enforced by
 * `check:boundaries`; here we assert the behavioral result). The rows are interleaved by `created_at`.
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

describe('Time activity feed (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let start: StartTimerProvider;
  let stop: StopTimerProvider;
  let create: CreateTimeLogProvider;
  let update: UpdateTimeLogProvider;
  let remove: DeleteTimeLogProvider;
  let timers: TimersRepository;
  let activity: ActivityRepository;
  let now: Date;
  const clock: Clock = { now: () => now };

  /** The ordered TIME_* actions in RY-1's feed (the feed also carries any non-time actions). */
  const timeActions = async (): Promise<string[]> => {
    const rows = await tenant.run(CTX, () => activity.listForItem(RY_1));
    return rows.map((r) => r.action).filter((a) => a.startsWith('TIME_'));
  };

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timers = new TimersRepository(handle.db, tenant);
    activity = new ActivityRepository(handle.db, tenant);
    const timeLogs = new TimeLogsRepository(handle.db, tenant);
    const access = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      activity,
    );
    const projects = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    const idem = new IdempotencyService(new FakeRedis() as unknown as Redis, tenant);
    start = new StartTimerProvider(timers, access, projects, clock, idem, tenant);
    stop = new StopTimerProvider(timers, access, clock, idem, tenant);
    create = new CreateTimeLogProvider(timeLogs, access, projects, clock, idem, tenant);
    update = new UpdateTimeLogProvider(timeLogs, access, clock, tenant);
    remove = new DeleteTimeLogProvider(timeLogs, access, clock, tenant);
    now = new Date('2026-06-09T09:00:00.000Z');
    await tenant.run(CTX, () => timers.delete(SEED_TIMER_ID)); // avoid a switch-finalize onto RY-3
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('start appends TIME_STARTED (with the startedAt) to the item feed', async () => {
    await tenant.run(CTX, () => start.start(RY_1, null, undefined));
    const rows = await tenant.run(CTX, () => activity.listForItem(RY_1));
    const started = rows.find((r) => r.action === 'TIME_STARTED');
    expect(started).toBeTruthy();
    expect((started?.newValue as { startedAt?: string })?.startedAt).toBe(
      '2026-06-09T09:00:00.000Z',
    );
  });

  it('stop appends TIME_STOPPED and TIME_LOGGED', async () => {
    now = new Date('2026-06-09T09:30:00.000Z');
    const timer = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
    await tenant.run(CTX, () => stop.stop(timer?.id ?? '', undefined));
    const actions = await timeActions();
    expect(actions).toContain('TIME_STOPPED');
    expect(actions).toContain('TIME_LOGGED');
    // start precedes stop in the chronological feed.
    expect(actions.indexOf('TIME_STARTED')).toBeLessThan(actions.indexOf('TIME_STOPPED'));
  });

  it('manual create appends TIME_LOGGED with the duration', async () => {
    const before = (await timeActions()).filter((a) => a === 'TIME_LOGGED').length;
    await tenant.run(CTX, () => create.create(RY_1, { durationSeconds: 1800, note: 'after' }));
    const rows = await tenant.run(CTX, () => activity.listForItem(RY_1));
    const logged = rows.filter((r) => r.action === 'TIME_LOGGED');
    expect(logged.length).toBe(before + 1);
    expect(
      logged.some((r) => (r.newValue as { durationSeconds?: number })?.durationSeconds === 1800),
    ).toBe(true);
  });

  it('edit appends TIME_EDITED {old,new}; delete appends TIME_DELETED {old}', async () => {
    const created = await tenant.run(CTX, () => create.create(RY_1, { durationSeconds: 600 }));
    await tenant.run(CTX, () => update.update(created.id, { durationSeconds: 1200 }));
    await tenant.run(CTX, () => remove.delete(created.id));

    const rows = await tenant.run(CTX, () => activity.listForItem(RY_1));
    const edited = rows.find((r) => r.action === 'TIME_EDITED');
    const deleted = rows.find((r) => r.action === 'TIME_DELETED');
    expect((edited?.oldValue as { durationSeconds?: number })?.durationSeconds).toBe(600);
    expect((edited?.newValue as { durationSeconds?: number })?.durationSeconds).toBe(1200);
    expect((deleted?.oldValue as { durationSeconds?: number })?.durationSeconds).toBe(1200);
  });

  it('the feed is interleaved — every entry is ordered by created_at', async () => {
    const rows = await tenant.run(CTX, () => activity.listForItem(RY_1));
    const times = rows.map((r) => new Date(r.createdAt).getTime());
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    // All five TIME_* action kinds made it into the existing feed (no new endpoint/table).
    const kinds = new Set(rows.map((r) => r.action).filter((a) => a.startsWith('TIME_')));
    expect(kinds).toEqual(
      new Set(['TIME_STARTED', 'TIME_STOPPED', 'TIME_LOGGED', 'TIME_EDITED', 'TIME_DELETED']),
    );
  });
});
