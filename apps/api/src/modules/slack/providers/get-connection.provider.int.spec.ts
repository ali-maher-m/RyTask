import { NotFoundException } from '@nestjs/common';
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
import { SlackWorkspacesRepository } from '../repositories/slack-workspaces.repository';
import { GetConnectionProvider } from './get-connection.provider';

/**
 * Integration test against REAL PostgreSQL (US1, FR-WEB-101). Proves the connection read:
 * absent/revoked → `not_connected` (no secrets), a live install → `connected` with team +
 * `connectedAt` + default project, settings update mutates only `defaultProjectId`, and an
 * update with no live connection → 404.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const crypto = new AesGcmCrypto({
  slack: { tokenEncKey: Buffer.alloc(32, 9).toString('base64'), configured: true },
  mcp: {},
} as IntegrationsConfigType);

describe('GetConnectionProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let workspaces: SlackWorkspacesRepository;
  let provider: GetConnectionProvider;
  let connectionId: string;

  const upsertConnection = async (): Promise<string> => {
    const enc = crypto.encrypt('xoxb-secret');
    const row = await tenant.run(CTX, () =>
      workspaces.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        slackTeamId: 'T_CONN',
        slackTeamName: 'Connected Team',
        botUserId: 'U_BOT',
        botTokenCiphertext: enc.ciphertext,
        botTokenIv: enc.iv,
        botTokenTag: enc.tag,
        scopes: ['commands'],
        installedByUserId: SEED_USER_ID,
      }),
    );
    return row.id;
  };

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workspaces = new SlackWorkspacesRepository(handle.db, tenant);
    provider = new GetConnectionProvider(workspaces);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('reads as not_connected with no install (and never leaks a token)', async () => {
    const dto = await tenant.run(CTX, () => provider.getConnection());
    expect(dto.status).toBe('not_connected');
    expect(dto.team).toBeNull();
    expect(dto.connectedAt).toBeNull();
    expect(JSON.stringify(dto)).not.toContain('xoxb');
  });

  it('updateSettings with no live connection → 404', async () => {
    await expect(
      tenant.run(CTX, () => provider.updateSettings({ defaultProjectId: null })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reads a live install as connected with team + connectedAt', async () => {
    connectionId = await upsertConnection();
    const dto = await tenant.run(CTX, () => provider.getConnection());
    expect(dto.status).toBe('connected');
    expect(dto.team).toEqual({ id: 'T_CONN', name: 'Connected Team' });
    expect(dto.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dto.defaultProjectId).toBeNull();
    expect(JSON.stringify(dto)).not.toContain('xoxb');
  });

  it('updateSettings mutates the default project then re-reads connected', async () => {
    const dto = await tenant.run(CTX, () => provider.updateSettings({ defaultProjectId: null }));
    expect(dto.status).toBe('connected');
    expect(dto.defaultProjectId).toBeNull();
  });

  it('a revoked install reads back as not_connected', async () => {
    await tenant.run(CTX, () => workspaces.setRevoked(connectionId, new Date()));
    const dto = await tenant.run(CTX, () => provider.getConnection());
    expect(dto.status).toBe('not_connected');
  });
});
