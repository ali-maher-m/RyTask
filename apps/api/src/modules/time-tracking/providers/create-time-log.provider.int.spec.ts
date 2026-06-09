import {
  type DbHandle,
  SEED_ORG_ID,
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
import { CreateTimeLogProvider } from './create-time-log.provider';

/**
 * Integration test against REAL PostgreSQL (T041, §14.1). Proves manual create: the duration-only form
 * derives `endedAt`, the start/end form derives `durationSeconds`, `source = MANUAL` is forced, an
 * explicit `classification` sets the override flag, an invalid form rejects with nothing persisted, and
 * a replayed create with the same `Idempotency-Key` writes exactly one entry.
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

describe('CreateTimeLogProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: CreateTimeLogProvider;
  let timeLogs: TimeLogsRepository;
  const now = new Date('2026-06-09T15:00:00.000Z');
  const clock: Clock = { now: () => now };

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
    provider = new CreateTimeLogProvider(
      timeLogs,
      access,
      projects,
      clock,
      new IdempotencyService(new FakeRedis() as unknown as Redis, tenant),
      tenant,
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('duration-only derives endedAt and forces source MANUAL (PLANNED, not overridden)', async () => {
    const log = await tenant.run(CTX, () =>
      provider.create(RY_1, { durationSeconds: 3600, date: '2026-06-01', note: 'drafting' }),
    );
    expect(log.source).toBe('MANUAL');
    expect(log.durationSeconds).toBe(3600);
    expect(log.startedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(log.endedAt).toBe('2026-06-01T01:00:00.000Z');
    expect(log.classification).toBe('PLANNED');
    expect(log.classificationOverridden).toBe(false);

    const persisted = await tenant.run(CTX, () => timeLogs.findById(log.id));
    expect(persisted?.durationSeconds).toBe(3600);
  });

  it('start/end derives durationSeconds', async () => {
    const log = await tenant.run(CTX, () =>
      provider.create(RY_1, {
        startedAt: '2026-06-05T09:00:00.000Z',
        endedAt: '2026-06-05T11:30:00.000Z',
      }),
    );
    expect(log.durationSeconds).toBe(9000); // 2h30m
    expect(log.source).toBe('MANUAL');
  });

  it('an explicit classification sets classificationOverridden', async () => {
    const log = await tenant.run(CTX, () =>
      provider.create(RY_1, { durationSeconds: 600, classification: 'INTERRUPTION' }),
    );
    expect(log.classification).toBe('INTERRUPTION');
    expect(log.classificationOverridden).toBe(true);
  });

  it('an invalid form rejects with nothing persisted', async () => {
    const before = await tenant.run(CTX, () => timeLogs.listForItem(RY_1));
    await expect(
      tenant.run(CTX, () =>
        provider.create(RY_1, {
          durationSeconds: 60,
          startedAt: '2026-06-05T09:00:00.000Z',
          endedAt: '2026-06-05T09:01:00.000Z',
        }),
      ),
    ).rejects.toThrow();
    const after = await tenant.run(CTX, () => timeLogs.listForItem(RY_1));
    expect(after.length).toBe(before.length);
  });

  it('a replayed create with the same Idempotency-Key writes exactly one entry', async () => {
    const first = await tenant.run(CTX, () =>
      provider.create(RY_1, { durationSeconds: 1234, note: 'replay' }, 'idem-create-1'),
    );
    const replay = await tenant.run(CTX, () =>
      provider.create(RY_1, { durationSeconds: 1234, note: 'replay' }, 'idem-create-1'),
    );
    expect(replay.id).toBe(first.id);

    const matches = await tenant.run(CTX, () =>
      timeLogs.listForItem(RY_1).then((rows) => rows.filter((r) => r.durationSeconds === 1234)),
    );
    expect(matches).toHaveLength(1);
  });
});
