import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IntegrationsConfigType } from '../../../common/config/integrations.config';
import { AesGcmCrypto } from '../../../common/crypto/aes-gcm-crypto.adapter';
import type { Clock } from '../../../common/ports/clock.port';
import type { SlackPort } from '../../../common/ports/slack.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { DisconnectSlackProvider } from './disconnect-slack.provider';

/**
 * Integration test against REAL PostgreSQL (T032, US1, FR-SLK-003). Disconnect revokes the bot
 * token at Slack, soft-revokes the row (`revoked_at`) so capture stops, and is idempotent.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const BOT_TOKEN = 'xoxb-token-to-revoke';

const clock: Clock = { now: () => new Date('2026-06-06T12:00:00.000Z') };
const crypto = new AesGcmCrypto({
  slack: { tokenEncKey: Buffer.alloc(32, 9).toString('base64'), configured: true },
  mcp: {},
} as IntegrationsConfigType);

describe('DisconnectSlackProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspaces: SlackWorkspacesRepository;
  let revokeToken: ReturnType<typeof vi.fn>;
  let provider: DisconnectSlackProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspaces = new SlackWorkspacesRepository(handle.db, tenant);
    revokeToken = vi.fn(async () => undefined);
    const fakeSlack = { revokeToken } as unknown as SlackPort;
    provider = new DisconnectSlackProvider(fakeSlack, crypto, clock, workspaces);

    const enc = crypto.encrypt(BOT_TOKEN);
    await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_DISC',
        slackTeamName: 'Disco',
        botUserId: 'U_BOT',
        botTokenCiphertext: enc.ciphertext,
        botTokenIv: enc.iv,
        botTokenTag: enc.tag,
        scopes: [],
        installedByUserId: SEED_USER_ID,
      }),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('revokes the token at Slack and sets revoked_at (capture stops)', async () => {
    await tenant.run(CTX, () => provider.disconnect());

    expect(revokeToken).toHaveBeenCalledTimes(1);
    expect(revokeToken).toHaveBeenCalledWith(BOT_TOKEN); // decrypted before revoke

    const connection = await tenant.run(CTX, () => workspaces.findForOrg());
    expect(connection?.revokedAt).not.toBeNull();
  });

  it('is idempotent — a second disconnect is a no-op (no second revoke)', async () => {
    await tenant.run(CTX, () => provider.disconnect());
    expect(revokeToken).toHaveBeenCalledTimes(1);
  });
});
