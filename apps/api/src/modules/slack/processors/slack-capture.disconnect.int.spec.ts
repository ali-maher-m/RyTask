import type { INestApplication } from '@nestjs/common';
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { SlackCaptureProcessor } from './slack-capture.processor';

/**
 * Disconnect-interplay integration test against REAL Postgres (T104, US8, Edge Cases, FR-SLK-003).
 * A capture job that was enqueued (or retried) but resolves to a connection that is now `revokedAt`
 * — or to no connection at all (a never-connected / forged `team_id`) — performs NO write and leaves
 * no orphaned rows. The worker resolves the connection by `team_id` on the worker side, so disconnect
 * always wins the race against an in-flight job.
 */
const TEAM_ID = 'T_DISCONNECT';
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

const recorded: SlackMessage[] = [];
const fakeSlack = {
  respond: async (_url: string, message: SlackMessage) => {
    recorded.push(message);
  },
  postMessage: async () => undefined,
  openModal: async () => undefined,
} as unknown as SlackPort;

describe('Slack capture vs disconnect (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;
  let processor: SlackCaptureProcessor;
  let workspaces: SlackWorkspacesRepository;
  let slackUsers: SlackUsersRepository;
  let tenant: TenantContextService;
  let connectionId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SLACK)
      .useValue(fakeSlack)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    processor = app.get(SlackCaptureProcessor);
    workspaces = app.get(SlackWorkspacesRepository);
    slackUsers = app.get(SlackUsersRepository);
    tenant = app.get(TenantContextService);

    const connection = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: TEAM_ID,
        slackTeamName: 'Disconnect Co',
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
    await pg?.stop();
  });

  const capture = (teamId: string) =>
    processor.handle({
      kind: 'slash',
      teamId,
      slackUserId: 'U_CAPTOR',
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/commands/x',
      triggerId: `trig-${teamId}`,
      text: 'Should never be written',
    });

  it('writes nothing when the resolved connection is revoked (no orphaned rows)', async () => {
    // Disconnect first, then run the queued job — disconnect wins the race.
    await tenant.run(CTX, async () => {
      const conn = await workspaces.findForOrg();
      if (conn) await workspaces.setRevoked(conn.id, new Date());
    });

    const before = await handle.db.select().from(workItems);
    const outcome = await capture(TEAM_ID);

    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') {
      expect(outcome.reason).toBe('disconnected');
    }
    const after = await handle.db.select().from(workItems);
    expect(after.length).toBe(before.length);
    expect(recorded).toHaveLength(0); // no reply, no side effects
  });

  it('writes nothing for a never-connected / forged team_id', async () => {
    const before = await handle.db.select().from(workItems);
    const outcome = await capture('T_NEVER_CONNECTED');

    expect(outcome.status).toBe('skipped');
    const after = await handle.db.select().from(workItems);
    expect(after.length).toBe(before.length);
  });
});
