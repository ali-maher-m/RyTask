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
import { GithubConnectionsRepository } from './github-connections.repository';

/**
 * Cross-tenant isolation for `github_connections` (M5, FR-TEN-001). Org A can never list or
 * revoke Org B's connection — enforced structurally by `TenantScopedRepository`, proven against
 * real Postgres. `findById` is intentionally global (the webhook resolver) and is NOT exercised
 * here as a tenant read.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000d2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d3';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const secretParts = {
  webhookSecretCiphertext: 'c',
  webhookSecretIv: 'i',
  webhookSecretTag: 't',
};

describe('github-connections tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: GithubConnectionsRepository;
  let connBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new GithubConnectionsRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-gh' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-gh' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b-gh@b.test', name: 'B' });

    await tenant.run(ctxA, () =>
      repo.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        repoFullName: 'acme/web',
        createdByUserId: SEED_USER_ID,
        ...secretParts,
      }),
    );
    const b = await tenant.run(ctxB, () =>
      repo.upsert({
        workspaceId: WS_B,
        repoFullName: 'beta/api',
        createdByUserId: USER_B,
        ...secretParts,
      }),
    );
    connBId = b.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists only the caller org’s connections', async () => {
    const seenByA = await tenant.run(ctxA, () => repo.listForOrg());
    expect(seenByA.map((c) => c.repoFullName)).toEqual(['acme/web']);

    const seenByB = await tenant.run(ctxB, () => repo.listForOrg());
    expect(seenByB.map((c) => c.repoFullName)).toEqual(['beta/api']);
  });

  it('cannot revoke another org’s connection (scoped update is a no-op)', async () => {
    const revoked = await tenant.run(ctxA, () => repo.revoke(connBId));
    expect(revoked).toBe(false);

    const stillActive = await tenant.run(ctxB, () => repo.listForOrg());
    expect(stillActive[0]?.revokedAt).toBeNull();
  });

  it('the same repoFullName may be connected by two different orgs (uniqueness is per-org)', async () => {
    await tenant.run(ctxB, () =>
      repo.upsert({
        workspaceId: WS_B,
        repoFullName: 'acme/web',
        createdByUserId: USER_B,
        ...secretParts,
      }),
    );
    const seenByB = await tenant.run(ctxB, () => repo.listForOrg());
    expect(seenByB.map((c) => c.repoFullName).sort()).toEqual(['acme/web', 'beta/api']);
  });
});
