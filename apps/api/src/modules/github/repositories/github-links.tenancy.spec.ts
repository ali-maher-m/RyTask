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
import { GithubLinksRepository } from './github-links.repository';

/**
 * Cross-tenant isolation for `github_links` (M5, FR-TEN-001), proven against real Postgres:
 * a link on an org-A item is invisible under org B's tenant context, and the unique-index
 * idempotency (`insertIfAbsent`) holds within the owning org.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000e1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000e2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000e3';

/** Seeded item RY-1 (org A). */
const ITEM_A = '0193b3a0-0000-7000-8000-000000000020';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('github-links tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let links: GithubLinksRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A, items RY-1..3
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    links = new GithubLinksRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-ghl' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-ghl' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b-ghl@b.test', name: 'B' });

    const connections = new GithubConnectionsRepository(handle.db, tenant);
    const conn = await tenant.run(ctxA, () =>
      connections.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        repoFullName: 'acme/web',
        webhookSecretCiphertext: 'c',
        webhookSecretIv: 'i',
        webhookSecretTag: 't',
        createdByUserId: SEED_USER_ID,
      }),
    );

    const inserted = await tenant.run(ctxA, () =>
      links.insertIfAbsent({
        workItemId: ITEM_A,
        connectionId: conn.id,
        kind: 'COMMIT',
        externalRef: 'abc123',
        url: 'https://github.com/acme/web/commit/abc123',
        title: 'Fixes RY-1',
        authorLogin: 'octocat',
      }),
    );
    expect(inserted).toBe(true);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('org B cannot see org A’s links even for the same work-item id', async () => {
    const seenByB = await tenant.run(ctxB, () => links.listForItem(ITEM_A));
    expect(seenByB).toEqual([]);

    const seenByA = await tenant.run(ctxA, () => links.listForItem(ITEM_A));
    expect(seenByA).toHaveLength(1);
  });

  it('replaying the same link is a no-op within the owning org (unique-index idempotency)', async () => {
    const conn = await tenant.run(ctxA, () =>
      new GithubConnectionsRepository(handle.db, tenant).listForOrg(),
    );
    const again = await tenant.run(ctxA, () =>
      links.insertIfAbsent({
        workItemId: ITEM_A,
        connectionId: conn[0]?.id ?? '',
        kind: 'COMMIT',
        externalRef: 'abc123',
        url: 'https://github.com/acme/web/commit/abc123',
        title: 'Fixes RY-1',
        authorLogin: 'octocat',
      }),
    );
    expect(again).toBe(false);

    const rows = await tenant.run(ctxA, () => links.listForItem(ITEM_A));
    expect(rows).toHaveLength(1);
  });
});
