import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { ListSlackUsersProvider } from './list-slack-users.provider';
import { MapSlackUserProvider } from './map-slack-user.provider';

/**
 * Integration test against REAL PostgreSQL (T086, US5, FR-SLK-002, US5.2). Proves the mapping
 * lifecycle on the org's connection: list returns mapped + unmapped rows; a manual link sets
 * `userId` + `mappedManually = true`; an unlink clears `userId` back to unmapped — capture is never
 * blocked on it. All through the tenant-scoped repositories (the providers resolve the connection
 * server-side), so a foreign org can never see or touch these rows (FR-X-001).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('MapSlackUserProvider / ListSlackUsersProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspaces: SlackWorkspacesRepository;
  let slackUsers: SlackUsersRepository;
  let list: ListSlackUsersProvider;
  let map: MapSlackUserProvider;
  let connectionId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspaces = new SlackWorkspacesRepository(handle.db, tenant);
    slackUsers = new SlackUsersRepository(handle.db, tenant);
    list = new ListSlackUsersProvider(workspaces, slackUsers);
    map = new MapSlackUserProvider(workspaces, slackUsers);

    // Seed one connection + two discovered Slack users: one auto-mapped, one unmapped.
    connectionId = await tenant.run(CTX, async () => {
      const connection = await workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_MAP',
        slackTeamName: 'Mapping Team',
        botUserId: 'U_BOT',
        botTokenCiphertext: 'cipher',
        botTokenIv: 'iv',
        botTokenTag: 'tag',
        scopes: ['commands'],
        installedByUserId: SEED_USER_ID,
      });
      await slackUsers.upsertMany([
        {
          slackWorkspaceId: connection.id,
          slackUserId: 'U_FOUNDER',
          slackUserName: 'Founder',
          slackUserEmail: 'founder@rytask.local',
          userId: SEED_USER_ID,
        },
        {
          slackWorkspaceId: connection.id,
          slackUserId: 'U_GHOST',
          slackUserName: 'Ghost',
          slackUserEmail: 'ghost@example.com',
          userId: null,
        },
      ]);
      return connection.id;
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists mapped and unmapped rows', async () => {
    const rows = await tenant.run(CTX, () => list.list());
    const byId = new Map(rows.map((r) => [r.slackUserId, r]));
    expect(byId.get('U_FOUNDER')?.mappedUserId).toBe(SEED_USER_ID);
    expect(byId.get('U_FOUNDER')?.mappedManually).toBe(false); // auto-mapped on connect
    expect(byId.get('U_GHOST')?.mappedUserId).toBeNull(); // unmapped — capture still works
  });

  it('manual link sets userId + mappedManually=true', async () => {
    const mapped = await tenant.run(CTX, () => map.map('U_GHOST', SEED_USER_ID));
    expect(mapped.mappedUserId).toBe(SEED_USER_ID);
    expect(mapped.mappedManually).toBe(true);

    const persisted = await tenant.run(CTX, () =>
      slackUsers.findBySlackUserId(connectionId, 'U_GHOST'),
    );
    expect(persisted?.userId).toBe(SEED_USER_ID);
    expect(persisted?.mappedManually).toBe(true);
  });

  it('unlink clears userId back to unmapped', async () => {
    await tenant.run(CTX, () => map.unmap('U_GHOST'));
    const rows = await tenant.run(CTX, () => list.list());
    const ghost = rows.find((r) => r.slackUserId === 'U_GHOST');
    expect(ghost?.mappedUserId).toBeNull();
    expect(ghost?.mappedManually).toBe(false);
  });

  it('404s when mapping an unknown Slack user', async () => {
    await expect(tenant.run(CTX, () => map.map('U_NOPE', SEED_USER_ID))).rejects.toMatchObject({
      status: 404,
    });
  });
});
