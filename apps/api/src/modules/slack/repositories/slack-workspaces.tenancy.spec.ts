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
import { SlackWorkspacesRepository } from './slack-workspaces.repository';

/**
 * Cross-tenant isolation for `slack_workspaces` (M3, FR-X-001, data-model §5). Org A can never
 * read or revoke Org B's connection — enforced structurally by `TenantScopedRepository`, proven
 * against real Postgres. `findByTeamId` is intentionally global (the webhook resolver) and is
 * NOT exercised here as a tenant read.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000c1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000c2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000c3';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const tokenParts = { botTokenCiphertext: 'c', botTokenIv: 'i', botTokenTag: 't', scopes: [] };

describe('slack-workspaces tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: SlackWorkspacesRepository;
  let connAId: string;
  let connBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new SlackWorkspacesRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-slack' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-slack' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b-slack@b.test', name: 'B' });

    const a = await tenant.run(ctxA, () =>
      repo.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_AAA',
        slackTeamName: 'Acme',
        botUserId: 'U_BOT_A',
        installedByUserId: SEED_USER_ID,
        ...tokenParts,
      }),
    );
    const b = await tenant.run(ctxB, () =>
      repo.upsert({
        workspaceId: WS_B,
        slackTeamId: 'T_BBB',
        slackTeamName: 'Beta',
        botUserId: 'U_BOT_B',
        installedByUserId: USER_B,
        ...tokenParts,
      }),
    );
    connAId = a.id;
    connBId = b.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org sees only its own connection', async () => {
    expect((await tenant.run(ctxA, () => repo.findForOrg()))?.id).toBe(connAId);
    expect((await tenant.run(ctxB, () => repo.findForOrg()))?.id).toBe(connBId);
  });

  it('never leaks a connection across tenants (findById)', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(connBId))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(connAId))).toBeNull();
  });

  it("disconnect cannot revoke another org's connection", async () => {
    expect(await tenant.run(ctxA, () => repo.setRevoked(connBId, new Date()))).toBe(false);
    expect((await tenant.run(ctxB, () => repo.findById(connBId)))?.revokedAt).toBeNull();
  });

  it('updateSettings cannot touch another org row', async () => {
    expect(
      await tenant.run(ctxA, () => repo.updateSettings(connBId, { defaultProjectId: null })),
    ).toBeNull();
  });
});
