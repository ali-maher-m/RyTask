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
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';
import { DisconnectGithubProvider } from './disconnect-github.provider';

/**
 * Integration test against REAL PostgreSQL (M5 — the Slack-disconnect shape). Disconnect is a
 * SOFT revoke: the row survives (FR-INT-GH-010, links preserved read-only), `revoked_at` is set,
 * and revoking an unknown id is a clean 404.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('DisconnectGithubProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let connections: GithubConnectionsRepository;
  let provider: DisconnectGithubProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    connections = new GithubConnectionsRepository(handle.db, tenant);
    provider = new DisconnectGithubProvider(connections);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('soft-revokes the connection: row survives with revoked_at set', async () => {
    const row = await tenant.run(CTX, () =>
      connections.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        repoFullName: 'acme/web',
        webhookSecretCiphertext: 'c',
        webhookSecretIv: 'i',
        webhookSecretTag: 't',
        createdByUserId: SEED_USER_ID,
      }),
    );

    await tenant.run(CTX, () => provider.disconnect(row.id));

    const after = await tenant.run(CTX, () => connections.listForOrg());
    expect(after).toHaveLength(1); // soft revoke — the row is NOT deleted
    expect(after[0]?.revokedAt).toBeInstanceOf(Date);

    // The global webhook resolver still finds it (and the processor skips on revokedAt).
    const resolved = await connections.findById(row.id);
    expect(resolved?.revokedAt).toBeInstanceOf(Date);
  });

  it('404s on an unknown connection id', async () => {
    await expect(
      tenant.run(CTX, () => provider.disconnect('0193b3a0-0000-7000-8000-0000000000ff')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
