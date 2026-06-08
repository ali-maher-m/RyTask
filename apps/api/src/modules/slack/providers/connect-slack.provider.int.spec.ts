import type { UserSummary } from '@rytask/contracts';
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
import type {
  SlackOAuthResult,
  SlackPort,
  SlackWorkspaceUser,
} from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import type { UserProvisioningService } from '../../identity/identity.contract';
import { SlackUsersRepository } from '../repositories/slack-users.repository';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { ConnectSlackProvider } from './connect-slack.provider';

/**
 * Integration test against REAL PostgreSQL (T031, US1, FR-SLK-001/002). Proves connect
 * end-to-end: OAuth exchange → a `slack_workspaces` row with the bot token ENCRYPTED at rest →
 * auto-map workspace users to RyTask users by email (matched → linked, unmatched → unmapped).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const BOT_TOKEN = 'xoxb-super-secret-123';

const OAUTH: SlackOAuthResult = {
  teamId: 'T_TEST',
  teamName: 'Test Team',
  botUserId: 'U_BOT',
  botToken: BOT_TOKEN,
  scopes: ['commands', 'chat:write'],
  authedUserId: 'U_ADMIN',
};

const WORKSPACE_USERS: SlackWorkspaceUser[] = [
  { id: 'U_FOUNDER', name: 'Founder', email: 'founder@rytask.local' },
  { id: 'U_OTHER', name: 'Other', email: 'nobody@example.com' },
];

// Fake Slack adapter — only the connect-path methods are exercised.
const fakeSlack = {
  exchangeOAuthCode: async () => OAUTH,
  listWorkspaceUsers: async () => WORKSPACE_USERS,
} as unknown as SlackPort;

// Fake identity provisioning — the seeded founder's email resolves to SEED_USER_ID; others don't.
const fakeUsers = {
  async findByEmail(email: string): Promise<UserSummary | null> {
    return email === 'founder@rytask.local'
      ? { id: SEED_USER_ID, email, name: 'Founder', emailVerified: true }
      : null;
  },
} as unknown as UserProvisioningService;

// Real AES-256-GCM crypto with a deterministic 32-byte test key.
const crypto = new AesGcmCrypto({
  slack: { tokenEncKey: Buffer.alloc(32, 7).toString('base64'), configured: true },
  mcp: {},
} as IntegrationsConfigType);

describe('ConnectSlackProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspaces: SlackWorkspacesRepository;
  let slackUsers: SlackUsersRepository;
  let provider: ConnectSlackProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspaces = new SlackWorkspacesRepository(handle.db, tenant);
    slackUsers = new SlackUsersRepository(handle.db, tenant);
    provider = new ConnectSlackProvider(
      fakeSlack,
      crypto,
      fakeUsers,
      workspaces,
      slackUsers,
      tenant,
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('persists an encrypted connection and auto-maps users by email', async () => {
    await tenant.run(CTX, () => provider.connect('the-code'));

    const connection = await tenant.run(CTX, () => workspaces.findForOrg());
    expect(connection).not.toBeNull();
    expect(connection?.slackTeamId).toBe('T_TEST');
    expect(connection?.slackTeamName).toBe('Test Team');
    expect(connection?.installedByUserId).toBe(SEED_USER_ID);

    // The bot token is stored ENCRYPTED, and decrypts back to the plaintext (Principle VI).
    expect(connection?.botTokenCiphertext).not.toBe(BOT_TOKEN);
    expect(
      crypto.decrypt({
        ciphertext: connection?.botTokenCiphertext ?? '',
        iv: connection?.botTokenIv ?? '',
        tag: connection?.botTokenTag ?? '',
      }),
    ).toBe(BOT_TOKEN);

    const rows = await tenant.run(CTX, () => slackUsers.listForWorkspace(connection?.id ?? ''));
    const byId = new Map(rows.map((r) => [r.slackUserId, r]));
    expect(byId.get('U_FOUNDER')?.userId).toBe(SEED_USER_ID); // matched by email
    expect(byId.get('U_OTHER')?.userId).toBeNull(); // unmatched → unmapped, capture still works
  });

  it('is idempotent on reconnect (same team → one connection, revoked cleared)', async () => {
    await tenant.run(CTX, () => provider.connect('the-code-again'));
    const connection = await tenant.run(CTX, () => workspaces.findForOrg());
    expect(connection?.revokedAt).toBeNull();
    expect(connection?.slackTeamId).toBe('T_TEST');
  });
});
