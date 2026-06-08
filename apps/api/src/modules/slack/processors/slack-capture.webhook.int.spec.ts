import { type INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { type StartedRedis, startRedis } from '../../../common/testing/redis';
import { computeSlackSignature } from '../domain/slack-signature.policy';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { type SlackCaptureJob, SlackCaptureProcessor } from './slack-capture.processor';
import { SlackCaptureQueue } from './slack-capture.queue';

/**
 * Webhook integration test against REAL Postgres + REAL Redis (T103, US8, FR-SLK-014, SC-006). Proves
 * the full capture contract end-to-end (slack-capture-flow §1/§2): a signed `/commands` request is
 * VERIFIED and ACKed within Slack's 3 s window, the heavy create runs ASYNC on the BullMQ worker, and
 * a REPLAYED delivery (same deterministic `jobId`) creates EXACTLY ONE item — idempotency is the id,
 * with no dedupe table (research D7).
 */
const SIGNING_SECRET = 'test-slack-webhook-secret';
const TEAM_ID = 'T_WEBHOOK';
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

const recorded: SlackMessage[] = [];
const fakeSlack = {
  respond: async (_url: string, message: SlackMessage) => {
    recorded.push(message);
  },
  postMessage: async () => undefined,
  openModal: async () => undefined,
} as unknown as SlackPort;

/** Count the work items with a given exact title (the dedup proof scopes to the replayed delivery). */
async function countByTitle(handle: DbHandle, title: string): Promise<number> {
  return (await handle.db.select().from(workItems).where(eq(workItems.title, title))).length;
}

/** Poll `predicate` until true or the timeout elapses. */
async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor: condition not met within timeout');
}

describe('Slack capture webhook (integration)', () => {
  let pg: StartedPostgres;
  let redis: StartedRedis;
  let handle: DbHandle;
  let app: INestApplication;
  let processor: SlackCaptureProcessor;
  let workspaces: SlackWorkspacesRepository;
  let slackUsers: SlackUsersRepository;
  let tenant: TenantContextService;
  let connectionId: string;

  beforeAll(async () => {
    [pg, redis] = await Promise.all([startPostgres(), startRedis()]);
    process.env.DATABASE_URL = pg.url;
    process.env.REDIS_URL = redis.url; // the app producer + the worker share this Redis
    process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SLACK)
      .useValue(fakeSlack)
      .compile();
    // `rawBody: true` + the prefix mirror main.ts so the signature guard sees the exact bytes.
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1', {
      exclude: [
        'healthz',
        'readyz',
        { path: 'integrations/slack/oauth/callback', method: RequestMethod.GET },
      ],
    });
    await app.init();

    processor = app.get(SlackCaptureProcessor);
    workspaces = app.get(SlackWorkspacesRepository);
    slackUsers = app.get(SlackUsersRepository);
    tenant = app.get(TenantContextService);

    // A connected workspace routing capture to the seeded project, with a mapped captor.
    const connection = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: TEAM_ID,
        slackTeamName: 'Webhook Co',
        botUserId: 'U_BOT',
        botTokenCiphertext: 'c',
        botTokenIv: 'i',
        botTokenTag: 't',
        scopes: ['commands'],
        installedByUserId: SEED_USER_ID,
        defaultProjectId: SEED_PROJECT_ID,
      }),
    );
    connectionId = connection.id;
    await tenant.run(CTX, () =>
      slackUsers.upsertMany([
        { slackWorkspaceId: connectionId, slackUserId: 'U_CAPTOR', slackUserName: 'Captor' },
      ]),
    );
    await tenant.run(CTX, () => slackUsers.setMapping(connectionId, 'U_CAPTOR', SEED_USER_ID));
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
    Reflect.deleteProperty(process.env, 'DATABASE_URL');
    Reflect.deleteProperty(process.env, 'REDIS_URL');
    Reflect.deleteProperty(process.env, 'SLACK_SIGNING_SECRET');
    await Promise.all([pg?.stop(), redis?.stop()]);
  });

  it('verifies the signature and acks within Slack’s 3 s window', async () => {
    const raw = `team_id=${TEAM_ID}&user_id=U_CAPTOR&channel_id=C1&command=%2Ftask&text=Acked+fast&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2Fx&trigger_id=trig-ack`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = computeSlackSignature(SIGNING_SECRET, ts, raw);

    const startedAt = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/v1/integrations/slack/commands')
      .set('content-type', 'application/x-www-form-urlencoded')
      .set('x-slack-request-timestamp', ts)
      .set('x-slack-signature', sig)
      .send(raw);
    const elapsed = Date.now() - startedAt;

    expect(res.status).toBe(200);
    expect(res.body.response_type).toBe('ephemeral');
    expect(elapsed).toBeLessThan(3000); // ack well inside the 3 s window (FR-SLK-014)
  });

  it('processes async and a replayed delivery (same jobId) creates exactly one item', async () => {
    const job: SlackCaptureJob = {
      kind: 'slash',
      teamId: TEAM_ID,
      slackUserId: 'U_CAPTOR',
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/commands/replay',
      triggerId: 'trig-replay', // a fixed trigger id → a deterministic, idempotent jobId
      text: 'Replay-safe capture !high',
    };

    const TITLE = 'Replay-safe capture'; // quick-add strips the trailing `!high` priority token
    expect(await countByTitle(handle, TITLE)).toBe(0);
    const connection = new Redis(redis.url, { maxRetriesPerRequest: null });
    const prevWorker = process.env.WORKER;

    // Enqueue the SAME delivery twice BEFORE any worker drains it: BullMQ refuses the duplicate add
    // (same jobId), so only one job is ever waiting — the replay is dropped at the queue, not the DB.
    const queue = new SlackCaptureQueue(connection, processor);
    try {
      await queue.enqueue(job);
      await queue.enqueue(job); // replay of the same delivery

      // Now turn this instance into the worker and let it drain the single queued job.
      process.env.WORKER = '1';
      queue.onModuleInit();

      // Wait for the replayed delivery to be created, then prove there is EXACTLY ONE — the duplicate
      // add was dropped at the queue, so the second delivery never reached the DB (SC-006).
      await waitFor(async () => (await countByTitle(handle, TITLE)) >= 1, 20_000);
      expect(await countByTitle(handle, TITLE)).toBe(1);

      const [created] = await handle.db.select().from(workItems).where(eq(workItems.title, TITLE));
      expect(created?.source).toBe('SLACK');
      expect(created?.priority).toBe('HIGH');
      expect(created?.reporterId).toBe(SEED_USER_ID); // mapped captor
    } finally {
      await queue.onModuleDestroy();
      connection.disconnect();
      if (prevWorker === undefined) {
        // biome-ignore lint/performance/noDelete: restore pristine env for other specs
        delete process.env.WORKER;
      } else {
        process.env.WORKER = prevWorker;
      }
    }
  }, 60_000);
});
