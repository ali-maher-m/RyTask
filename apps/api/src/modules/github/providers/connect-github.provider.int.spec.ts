import { BadRequestException } from '@nestjs/common';
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
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';
import { ConnectGithubProvider } from './connect-github.provider';
import { ListGithubConnectionsProvider } from './list-github-connections.provider';

/**
 * Integration test against REAL PostgreSQL (M5, US1). Proves connect end-to-end: a minted
 * secret returned ONCE, stored ENCRYPTED at rest (Principle VI), listed without secret
 * material; reconnecting the same repo ROTATES the secret on the same row; and a missing
 * encryption key refuses kindly (400) writing nothing.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

// Real AES-256-GCM crypto with a deterministic 32-byte test key (the GitHub alias path).
const crypto = new AesGcmCrypto({
  slack: {},
  github: { tokenEncKey: Buffer.alloc(32, 9).toString('base64') },
  mcp: {},
} as IntegrationsConfigType);

describe('ConnectGithubProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let connections: GithubConnectionsRepository;
  let provider: ConnectGithubProvider;
  let list: ListGithubConnectionsProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    connections = new GithubConnectionsRepository(handle.db, tenant);
    provider = new ConnectGithubProvider(crypto, connections, tenant);
    list = new ListGithubConnectionsProvider(connections);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('mints a secret, stores it encrypted, and returns it exactly once', async () => {
    const res = await tenant.run(CTX, () => provider.connect({ repoFullName: 'acme/web' }));

    expect(res.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(res.data.repoFullName).toBe('acme/web');
    expect(res.data.webhookPath).toBe(`/api/v1/integrations/github/webhook/${res.data.id}`);

    const [row] = await tenant.run(CTX, () => connections.listForOrg());
    expect(row).toBeDefined();
    // Encrypted at rest: ciphertext differs from the secret, and decrypts back to it.
    expect(row?.webhookSecretCiphertext).not.toBe(res.webhookSecret);
    const decrypted = crypto.decrypt({
      ciphertext: row?.webhookSecretCiphertext ?? '',
      iv: row?.webhookSecretIv ?? '',
      tag: row?.webhookSecretTag ?? '',
    });
    expect(decrypted).toBe(res.webhookSecret);

    // The list DTO never carries secret material.
    const listed = await tenant.run(CTX, () => list.list());
    expect(listed.data).toHaveLength(1);
    expect(JSON.stringify(listed.data)).not.toContain(res.webhookSecret);
    expect(JSON.stringify(listed.data)).not.toContain(row?.webhookSecretCiphertext);
  });

  it('reconnecting the same repo rotates the secret on the same row (revoke cleared)', async () => {
    const first = await tenant.run(CTX, () => provider.connect({ repoFullName: 'acme/api' }));
    await tenant.run(CTX, () => connections.revoke(first.data.id));

    const second = await tenant.run(CTX, () => provider.connect({ repoFullName: 'acme/api' }));
    expect(second.data.id).toBe(first.data.id); // same row — the org↔repo unique index
    expect(second.webhookSecret).not.toBe(first.webhookSecret); // rotated
    expect(second.data.revokedAt).toBeNull(); // reconnect reactivates

    const rows = await tenant.run(CTX, () => connections.listForOrg());
    expect(rows.filter((r) => r.repoFullName === 'acme/api')).toHaveLength(1);
  });

  it('refuses kindly (400) when no encryption key is configured, writing nothing', async () => {
    const inert = new ConnectGithubProvider(
      new AesGcmCrypto({ slack: {}, github: {}, mcp: {} } as IntegrationsConfigType),
      connections,
      tenant,
    );
    await expect(
      tenant.run(CTX, () => inert.connect({ repoFullName: 'acme/mobile' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    const rows = await tenant.run(CTX, () => connections.listForOrg());
    expect(rows.some((r) => r.repoFullName === 'acme/mobile')).toBe(false);
  });
});
