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
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { SlackCaptureProcessor } from './slack-capture.processor';

/**
 * Integration test against REAL Postgres (T047, US2, FR-SLK-010/012/013). Drives the worker handler
 * end-to-end through the SAME `WorkItemsService.create` the web uses: a slash capture creates a work
 * item with `source = 'SLACK'`, smart defaults, the captor attributed when mapped (and `null` when
 * not), unresolved quick-add tokens surfaced, and a disconnected connection writing nothing.
 */
const TEAM_ID = 'T_CAPTURE';
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

const recorded: SlackMessage[] = [];
const fakeSlack = {
  respond: async (_url: string, message: SlackMessage) => {
    recorded.push(message);
  },
  postMessage: async () => undefined,
  openModal: async () => undefined,
} as unknown as SlackPort;

describe('SlackCaptureProcessor (integration)', () => {
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

    // A connected workspace routing capture to the seeded project, plus a mapped + an unmapped user.
    const connection = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: TEAM_ID,
        slackTeamName: 'Capture Co',
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
        { slackWorkspaceId: connectionId, slackUserId: 'U_MAPPED', slackUserName: 'Mapped' },
        { slackWorkspaceId: connectionId, slackUserId: 'U_UNMAPPED', slackUserName: 'Unmapped' },
      ]),
    );
    await tenant.run(CTX, () => slackUsers.setMapping(connectionId, 'U_MAPPED', SEED_USER_ID));
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
    Reflect.deleteProperty(process.env, 'DATABASE_URL');
    await pg?.stop();
  });

  beforeEach(() => {
    recorded.length = 0;
  });

  const slash = (slackUserId: string, text: string) =>
    processor.handle({
      kind: 'slash',
      teamId: TEAM_ID,
      slackUserId,
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/commands/x',
      triggerId: `trig-${slackUserId}-${text.length}`,
      text,
    });

  it('creates a SLACK-sourced item, parses quick-add, and attributes a mapped captor', async () => {
    const outcome = await slash('U_MAPPED', 'Fix login bug !urgent');
    expect(outcome.status).toBe('created');
    const id = outcome.status === 'created' ? outcome.workItemId : '';

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, id));
    expect(row?.source).toBe('SLACK');
    expect(row?.title).toBe('Fix login bug');
    expect(row?.priority).toBe('URGENT');
    expect(row?.reporterId).toBe(SEED_USER_ID); // mapped captor

    // Confirmation posted with the item title + a deep link (ephemeral, no secrets).
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.responseType).toBe('ephemeral');
    expect(recorded[0]?.text).toContain('Fix login bug');
    expect(recorded[0]?.text).toContain(`/work-items/${id}`);
  });

  it('creates with reporter = null and a link prompt when the captor is unmapped', async () => {
    const outcome = await slash('U_UNMAPPED', 'Write the changelog');
    expect(outcome.status).toBe('created');
    const id = outcome.status === 'created' ? outcome.workItemId : '';

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, id));
    expect(row?.source).toBe('SLACK');
    expect(row?.reporterId).toBeNull(); // unmapped → unattributed (capture still works)
    expect(recorded[0]?.text).toContain('link'); // "link your account" prompt
  });

  it('surfaces unresolved quick-add tokens verbatim in the confirmation', async () => {
    const outcome = await slash('U_MAPPED', 'Ship the thing @ghostuser');
    expect(outcome.status).toBe('created');
    // @ghostuser is not a project member → kept as an unresolved token, never dropped.
    expect(recorded[0]?.text).toContain('@ghostuser');
  });

  it('is a no-op when the connection is revoked (no orphaned write)', async () => {
    await tenant.run(CTX, async () => {
      const conn = await workspaces.findForOrg();
      if (conn) await workspaces.setRevoked(conn.id, new Date());
    });
    const before = await handle.db.select().from(workItems);
    const outcome = await slash('U_MAPPED', 'This should not be captured');
    expect(outcome.status).toBe('skipped');
    const after = await handle.db.select().from(workItems);
    expect(after.length).toBe(before.length);
    expect(recorded).toHaveLength(0);
  });
});
