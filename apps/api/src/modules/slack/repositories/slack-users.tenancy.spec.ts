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
  workspaces,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackUsersRepository } from './slack-users.repository';
import { SlackWorkspacesRepository } from './slack-workspaces.repository';

/**
 * Cross-tenant isolation for `slack_users` (M3, FR-X-001, data-model §5). One org's Slack ↔ user
 * mappings are never readable or mutable by another — proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000d2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d3';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const tokenParts = { botTokenCiphertext: 'c', botTokenIv: 'i', botTokenTag: 't', scopes: [] };

describe('slack-users tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspacesRepo: SlackWorkspacesRepository;
  let usersRepo: SlackUsersRepository;
  let connAId: string;
  let connBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspacesRepo = new SlackWorkspacesRepository(handle.db, tenant);
    usersRepo = new SlackUsersRepository(handle.db, tenant);

    await handle.db
      .insert(organizations)
      .values({ id: ORG_B, name: 'Org B', slug: 'org-bb-slack' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-bb-slack' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'bb-slack@b.test', name: 'B' });

    const connA = await tenant.run(ctxA, () =>
      workspacesRepo.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_UA',
        slackTeamName: 'Acme',
        botUserId: 'U_BOT_A',
        installedByUserId: SEED_USER_ID,
        ...tokenParts,
      }),
    );
    const connB = await tenant.run(ctxB, () =>
      workspacesRepo.upsert({
        workspaceId: WS_B,
        slackTeamId: 'T_UB',
        slackTeamName: 'Beta',
        botUserId: 'U_BOT_B',
        installedByUserId: USER_B,
        ...tokenParts,
      }),
    );
    connAId = connA.id;
    connBId = connB.id;

    await tenant.run(ctxA, () =>
      usersRepo.upsertMany([
        { slackWorkspaceId: connAId, slackUserId: 'U_A1', slackUserEmail: 'a1@a.test' },
      ]),
    );
    await tenant.run(ctxB, () =>
      usersRepo.upsertMany([
        { slackWorkspaceId: connBId, slackUserId: 'U_B1', slackUserEmail: 'b1@b.test' },
      ]),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org lists only its own Slack users', async () => {
    const a = await tenant.run(ctxA, () => usersRepo.listForWorkspace(connAId));
    const b = await tenant.run(ctxB, () => usersRepo.listForWorkspace(connBId));
    expect(a.map((r) => r.slackUserId)).toEqual(['U_A1']);
    expect(b.map((r) => r.slackUserId)).toEqual(['U_B1']);
  });

  it("never returns another org's mapping rows (cross-workspace id)", async () => {
    // Even handed the other org's workspace id, the org scope yields nothing.
    expect(await tenant.run(ctxA, () => usersRepo.listForWorkspace(connBId))).toHaveLength(0);
    expect(await tenant.run(ctxA, () => usersRepo.findBySlackUserId(connBId, 'U_B1'))).toBeNull();
  });

  it("cannot map a user inside another org's connection", async () => {
    expect(
      await tenant.run(ctxA, () => usersRepo.setMapping(connBId, 'U_B1', SEED_USER_ID)),
    ).toBeNull();
    // B's row is untouched (still unmapped).
    expect(
      (await tenant.run(ctxB, () => usersRepo.findBySlackUserId(connBId, 'U_B1')))?.userId,
    ).toBeNull();
  });
});
