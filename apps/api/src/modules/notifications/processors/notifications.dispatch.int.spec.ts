import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { type StartedRedis, startRedis } from '../../../common/testing/redis';
import { NotificationsRepository } from '../repositories/notifications.repository';
import {
  type NotificationJobData,
  NotificationsDispatchProcessor,
} from './notifications.dispatch.processor';
import { NotificationsQueue } from './notifications.queue';

/**
 * PROCESSOR integration test against REAL PostgreSQL + REAL Redis (T103, §14.1). Proves:
 *   - dispatch writes EXACTLY ONE notification row per recipient (self-action suppressed);
 *   - replaying the SAME job is idempotent (unique `dedupe_key`, onConflictDoNothing);
 *   - both the direct `handle()` path AND a real enqueue→Worker round-trip behave so.
 */
const ORG = SEED_ORG_ID;
const ENTITY = '0193b3a0-0000-7000-8000-000000000020';
const ALICE = SEED_USER_ID;
const BOB = '0193b3a0-0000-7000-8000-0000000000c8';
const CAROL = '0193b3a0-0000-7000-8000-0000000000c9';

const CTX = { organizationId: ORG, workspaceId: SEED_WORKSPACE_ID, userId: ALICE };

const jobData = (over: Partial<NotificationJobData> = {}): NotificationJobData => ({
  organizationId: ORG,
  type: 'COMMENTED',
  entityType: 'work_item',
  entityId: ENTITY,
  actorId: ALICE, // actor is suppressed
  recipientIds: [ALICE, BOB, CAROL],
  bucket: 'comment-1',
  payload: { key: 'RY-1' },
  ...over,
});

describe('NotificationsDispatchProcessor (processor integration)', () => {
  let pg: StartedPostgres;
  let redis: StartedRedis;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: NotificationsRepository;
  let processor: NotificationsDispatchProcessor;

  beforeAll(async () => {
    [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new NotificationsRepository(handle.db, tenant);
    processor = new NotificationsDispatchProcessor(repo, tenant);

    // bob + carol are recipients (no project membership needed for inbox rows).
    await handle.db.insert(users).values([
      { id: BOB, organizationId: ORG, email: 'bob@disp.test', name: 'bob' },
      { id: CAROL, organizationId: ORG, email: 'carol@disp.test', name: 'carol' },
    ]);
  }, 120_000);

  afterAll(async () => {
    await handle?.pool.end();
    await Promise.all([pg?.stop(), redis?.stop()]);
  });

  const countFor = (recipientId: string): Promise<number> =>
    tenant.run(CTX, () => repo.unreadCount(recipientId, new Date('2099-01-01T00:00:00.000Z')));

  it('direct handle(): exactly one row per recipient; actor suppressed', async () => {
    const written = await processor.handle(jobData());
    expect(written).toBe(2); // bob + carol (alice is the actor)
    expect(await countFor(ALICE)).toBe(0);
    expect(await countFor(BOB)).toBe(1);
    expect(await countFor(CAROL)).toBe(1);
  });

  it('direct handle() replay is idempotent (unique dedupe_key)', async () => {
    const written = await processor.handle(jobData()); // same job again
    expect(written).toBe(0);
    expect(await countFor(BOB)).toBe(1);
    expect(await countFor(CAROL)).toBe(1);
  });

  it('real enqueue→Worker round-trip writes exactly once and is replay-safe', async () => {
    // A distinct bucket so this is a fresh event (not deduped against the direct-path rows).
    const data = jobData({ bucket: 'comment-2', recipientIds: [ALICE, BOB] });

    const connection = new Redis(redis.url, { maxRetriesPerRequest: null });
    const prevWorker = process.env.WORKER;
    process.env.WORKER = '1';
    const queue = new NotificationsQueue(connection, processor);
    queue.onModuleInit(); // starts the Worker (WORKER=1)

    try {
      await queue.enqueue(data);
      await queue.enqueue(data); // replay the SAME job

      // Wait for the Worker to drain (bob should end with exactly one new row).
      await waitFor(async () => (await countFor(BOB)) === 2, 15_000);

      expect(await countFor(BOB)).toBe(2); // 1 from the direct path + 1 from this round-trip
      expect(await countFor(ALICE)).toBe(0); // actor still suppressed
    } finally {
      await queue.onModuleDestroy();
      connection.disconnect();
      if (prevWorker === undefined) {
        process.env.WORKER = undefined;
        // biome-ignore lint/performance/noDelete: restore pristine env for other specs
        delete process.env.WORKER;
      } else {
        process.env.WORKER = prevWorker;
      }
    }
  }, 60_000);
});

/** Poll `predicate` until true or the timeout elapses. */
async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor: condition not met within timeout');
}
