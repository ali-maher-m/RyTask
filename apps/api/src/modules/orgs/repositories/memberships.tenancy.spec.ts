import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  memberships,
  organizations,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { MembershipsRepository } from './memberships.repository';

/**
 * Cross-tenant isolation for `memberships` (T033, FR-TEN-001/003, SC-008). Org A can never
 * read/modify Org B's memberships — enforced structurally by TenantScopedRepository.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000a1';
const USER_B = '0193b3a0-0000-7000-8000-0000000000a2';

const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };

describe('memberships tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: MembershipsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A: founder OWNER membership in SEED_ORG_ID
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new MembershipsRepository(handle.db, tenant);

    // Stand up a separate org B with one member.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-mem' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });
    await handle.db
      .insert(memberships)
      .values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('reads only its own membership role', async () => {
    expect(await tenant.run(ctxA, () => repo.findRole(SEED_USER_ID))).toBe('OWNER');
    expect(await tenant.run(ctxB, () => repo.findRole(USER_B))).toBe('OWNER');
  });

  it('never reads another org’s membership', async () => {
    expect(await tenant.run(ctxA, () => repo.findRole(USER_B))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findRole(SEED_USER_ID))).toBeNull();
    expect(await tenant.run(ctxA, () => repo.findByUser(USER_B))).toBeNull();
  });

  it('list never leaks across tenants', async () => {
    const aMembers = await tenant.run(ctxA, () => repo.list());
    expect(aMembers.map((m) => m.userId)).toContain(SEED_USER_ID);
    expect(aMembers.map((m) => m.userId)).not.toContain(USER_B);
  });

  it('setRole cannot touch another org’s membership', async () => {
    const updated = await tenant.run(ctxA, () => repo.setRole(USER_B, 'VIEWER'));
    expect(updated).toBeNull();
    // Org B's membership is untouched.
    expect(await tenant.run(ctxB, () => repo.findRole(USER_B))).toBe('OWNER');
  });

  it('countActiveOwners is per-tenant', async () => {
    expect(await tenant.run(ctxA, () => repo.countActiveOwners())).toBe(1);
    expect(await tenant.run(ctxB, () => repo.countActiveOwners())).toBe(1);
  });
});
