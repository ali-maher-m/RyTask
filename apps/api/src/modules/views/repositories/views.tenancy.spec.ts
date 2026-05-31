import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  projects,
  runMigrations,
  seed,
  users,
  workspaces,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ViewsRepository } from './views.repository';

/**
 * Cross-tenant isolation for `views` (T079, FR-TEN-003, SC-014). Org A can never
 * read/update/delete Org B's saved views — enforced structurally by
 * TenantScopedRepository, proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000c1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000c2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000c3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000c4';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('views tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: ViewsRepository;
  let viewAId: string;
  let viewBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new ViewsRepository(handle.db, tenant);

    // Stand up a second, fully separate org B (just enough to own a view).
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-bv' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'wsv' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'bv@b.test', name: 'Bv' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'BVproj',
      keyPrefix: 'OBV',
    });

    const a = await tenant.run(ctxA, () =>
      repo.create({
        ownerId: SEED_USER_ID,
        projectId: SEED_PROJECT_ID,
        name: 'A view',
        kind: 'LIST',
        scope: 'PERSONAL',
      }),
    );
    const b = await tenant.run(ctxB, () =>
      repo.create({
        ownerId: USER_B,
        projectId: PROJ_B,
        name: 'B view',
        kind: 'LIST',
        scope: 'PERSONAL',
      }),
    );
    viewAId = a.id;
    viewBId = b.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('an org can read its own view', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(viewAId))).not.toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(viewBId))).not.toBeNull();
  });

  it('never leaks views across tenants (read)', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(viewBId))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(viewAId))).toBeNull();
  });

  it("never updates another tenant's view", async () => {
    const result = await tenant.run(ctxA, () => repo.update(viewBId, { name: 'hijacked' }));
    expect(result).toBeNull();
    // B's view is untouched.
    const bView = await tenant.run(ctxB, () => repo.findById(viewBId));
    expect(bView?.name).toBe('B view');
  });

  it("never deletes another tenant's view", async () => {
    await tenant.run(ctxA, () => repo.delete(viewBId));
    expect(await tenant.run(ctxB, () => repo.findById(viewBId))).not.toBeNull();
  });
});
