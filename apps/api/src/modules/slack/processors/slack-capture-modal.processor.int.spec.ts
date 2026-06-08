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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import type { SlackModalCapture } from '../providers/capture-from-slack.provider';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { SlackCaptureProcessor } from './slack-capture.processor';

/**
 * Integration test against REAL Postgres (T058, US3, FR-SLK-011/012). A modal submit creates a work
 * item with the SELECTED values, `source = 'SLACK'`, attributed to the mapped captor — and a
 * title-only submit still creates with smart defaults (capture never blocked on missing fields).
 */
const TEAM_ID = 'T_MODAL';
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

const recorded: SlackMessage[] = [];
const fakeSlack = {
  respond: async (_url: string, message: SlackMessage) => {
    recorded.push(message);
  },
  postMessage: async () => undefined,
  openModal: async () => undefined,
} as unknown as SlackPort;

describe('SlackCaptureProcessor modal submit (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;
  let processor: SlackCaptureProcessor;
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
    const workspaces = app.get(SlackWorkspacesRepository);
    const slackUsers = app.get(SlackUsersRepository);
    const tenant = app.get(TenantContextService);

    const connection = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: TEAM_ID,
        slackTeamName: 'Modal Co',
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

  const submit = (fields: SlackModalCapture, n: number) =>
    processor.handle({
      kind: 'modal_submit',
      teamId: TEAM_ID,
      slackUserId: 'U_MAPPED',
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/x',
      triggerId: `view-${n}`,
      fields,
    });

  it('creates a SLACK item with the selected modal fields', async () => {
    const outcome = await submit(
      {
        projectId: SEED_PROJECT_ID,
        title: 'Modal-captured task',
        description: 'from the modal',
        priority: 'HIGH',
        dueDate: '2026-06-30',
      },
      1,
    );
    expect(outcome.status).toBe('created');
    const id = outcome.status === 'created' ? outcome.workItemId : '';

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, id));
    expect(row?.source).toBe('SLACK');
    expect(row?.title).toBe('Modal-captured task');
    expect(row?.description).toBe('from the modal');
    expect(row?.priority).toBe('HIGH');
    expect(row?.dueDate).toBe('2026-06-30');
    expect(row?.reporterId).toBe(SEED_USER_ID);
    expect(recorded[0]?.text).toContain('Modal-captured task');
  });

  it('still creates with defaults from a title-only modal submit', async () => {
    const outcome = await submit({ projectId: SEED_PROJECT_ID, title: 'Just a title' }, 2);
    expect(outcome.status).toBe('created');
    const id = outcome.status === 'created' ? outcome.workItemId : '';

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, id));
    expect(row?.source).toBe('SLACK');
    expect(row?.title).toBe('Just a title');
    expect(row?.priority).toBe('NONE'); // smart default
    expect(row?.dueDate).toBeNull();
  });
});
