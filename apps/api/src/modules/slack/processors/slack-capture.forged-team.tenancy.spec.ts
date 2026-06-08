import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type Database,
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workItems,
  workspaces,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { SLACK, type SlackMessage, type SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { SlackCaptureProcessor } from './slack-capture.processor';

/**
 * Forged-`team_id` cross-tenant safety against REAL Postgres (T105, US8, FR-X-001, data-model §5).
 * The worker resolves the tenant SERVER-SIDE from the connection keyed by the signature-verified
 * `team_id` — never from a job-supplied org. So a capture for team B writes ONLY into org B (it can
 * never inject into org A), and a forged `team_id` that maps to no connection writes nothing at all.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000e1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000e2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000e3';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000000e4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000e5';
const TEAM_A = 'T_FORGE_A';
const TEAM_B = 'T_FORGE_B';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const recorded: SlackMessage[] = [];
const fakeSlack = {
  respond: async (_url: string, message: SlackMessage) => {
    recorded.push(message);
  },
  postMessage: async () => undefined,
  openModal: async () => undefined,
} as unknown as SlackPort;

async function seedOrgB(db: Database): Promise<void> {
  await db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-forge' });
  await db
    .insert(workspaces)
    .values({ id: WS_B, organizationId: ORG_B, name: 'B', slug: 'b-forge' });
  await db
    .insert(users)
    .values({ id: USER_B, organizationId: ORG_B, email: 'b-forge@b.test', name: 'B' });
  await db.insert(memberships).values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
  await db.insert(projects).values({
    id: PROJECT_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    name: 'B Project',
    keyPrefix: 'BFRG',
  });
  await db
    .insert(projectMembers)
    .values({ organizationId: ORG_B, projectId: PROJECT_B, userId: USER_B, role: 'ADMIN' });
  await db.insert(statuses).values({
    id: STATUS_B,
    organizationId: ORG_B,
    projectId: PROJECT_B,
    name: 'To Do',
    category: 'UNSTARTED',
    position: 1,
  });
  await db
    .insert(projectCounters)
    .values({ projectId: PROJECT_B, organizationId: ORG_B, lastNumber: 0 });
}

describe('Slack capture forged team_id (tenancy)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;
  let processor: SlackCaptureProcessor;
  let workspaces_: SlackWorkspacesRepository;
  let tenant: TenantContextService;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    await seedOrgB(handle.db);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SLACK)
      .useValue(fakeSlack)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    processor = app.get(SlackCaptureProcessor);
    workspaces_ = app.get(SlackWorkspacesRepository);
    tenant = app.get(TenantContextService);

    // Each org has its own connection: A → seeded project, B → its private project.
    await tenant.run(ctxA, () =>
      workspaces_.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: TEAM_A,
        slackTeamName: 'Acme',
        botUserId: 'U_BOT_A',
        botTokenCiphertext: 'c',
        botTokenIv: 'i',
        botTokenTag: 't',
        scopes: ['commands'],
        installedByUserId: SEED_USER_ID,
        defaultProjectId: SEED_PROJECT_ID,
      }),
    );
    await tenant.run(ctxB, () =>
      workspaces_.upsert({
        workspaceId: WS_B,
        slackTeamId: TEAM_B,
        slackTeamName: 'Beta',
        botUserId: 'U_BOT_B',
        botTokenCiphertext: 'c',
        botTokenIv: 'i',
        botTokenTag: 't',
        scopes: ['commands'],
        installedByUserId: USER_B,
        defaultProjectId: PROJECT_B,
      }),
    );
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
      slackUserId: 'U_SOMEONE',
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/commands/x',
      triggerId: `trig-${teamId}`,
      text: `Captured for ${teamId}`,
    });

  it('a capture for team B lands in org B and never in org A', async () => {
    const orgARowsBefore = await handle.db
      .select()
      .from(workItems)
      .where(eq(workItems.organizationId, SEED_ORG_ID));

    const outcome = await capture(TEAM_B);
    expect(outcome.status).toBe('created');
    const id = outcome.status === 'created' ? outcome.workItemId : '';

    const [created] = await handle.db.select().from(workItems).where(eq(workItems.id, id));
    expect(created?.organizationId).toBe(ORG_B); // server-resolved tenant, not job-supplied
    expect(created?.projectId).toBe(PROJECT_B);

    // Org A is untouched — the team-B delivery could not cross into it.
    const orgARowsAfter = await handle.db
      .select()
      .from(workItems)
      .where(eq(workItems.organizationId, SEED_ORG_ID));
    expect(orgARowsAfter.length).toBe(orgARowsBefore.length);
  });

  it('a forged team_id mapping to no connection writes nothing', async () => {
    const before = await handle.db.select().from(workItems);
    const outcome = await capture('T_FORGED_NONEXISTENT');
    expect(outcome.status).toBe('skipped');
    const after = await handle.db.select().from(workItems);
    expect(after.length).toBe(before.length);
  });
});
