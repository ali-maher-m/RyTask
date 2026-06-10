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
import type { IntegrationsConfigType } from '../../../common/config/integrations.config';
import { AesGcmCrypto } from '../../../common/crypto/aes-gcm-crypto.adapter';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { ListSlackUsersProvider } from './list-slack-users.provider';

/**
 * Integration test against REAL PostgreSQL (US5, FR-SLK-002, FR-WEB-102). Proves the mapping
 * list: no/revoked connection → empty list (the page's "not connected" empty state), and a live
 * connection → every discovered Slack user (mapped AND unmapped) so the admin can see who still
 * needs linking. Tenant-scoped.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const crypto = new AesGcmCrypto({
  slack: { tokenEncKey: Buffer.alloc(32, 5).toString('base64'), configured: true },
  mcp: {},
} as IntegrationsConfigType);

describe('ListSlackUsersProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspaces: SlackWorkspacesRepository;
  let slackUsers: SlackUsersRepository;
  let provider: ListSlackUsersProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspaces = new SlackWorkspacesRepository(handle.db, tenant);
    slackUsers = new SlackUsersRepository(handle.db, tenant);
    provider = new ListSlackUsersProvider(workspaces, slackUsers);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('no connection → empty list', async () => {
    expect(await tenant.run(CTX, () => provider.list())).toEqual([]);
  });

  it('a live connection → mapped + unmapped rows', async () => {
    const enc = crypto.encrypt('xoxb-secret');
    const connection = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_LIST',
        slackTeamName: 'List Team',
        botUserId: 'U_BOT',
        botTokenCiphertext: enc.ciphertext,
        botTokenIv: enc.iv,
        botTokenTag: enc.tag,
        scopes: ['commands'],
        installedByUserId: SEED_USER_ID,
      }),
    );
    await tenant.run(CTX, () =>
      slackUsers.upsertMany([
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
      ]),
    );

    const rows = await tenant.run(CTX, () => provider.list());
    expect(rows).toHaveLength(2);
    const bySlackId = new Map(rows.map((r) => [r.slackUserId, r]));
    expect(bySlackId.get('U_FOUNDER')?.mappedUserId).toBe(SEED_USER_ID);
    expect(bySlackId.get('U_GHOST')?.mappedUserId).toBeNull();
  });
});
