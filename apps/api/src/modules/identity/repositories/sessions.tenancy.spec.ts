import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  organizations,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SessionsRepository } from './sessions.repository';

/**
 * Cross-tenant isolation for `sessions` (T046, FR-TEN-001/003, SC-008). Org A can never read
 * or revoke Org B's sessions through the tenant-scoped paths. `findByRefreshHash` is a
 * documented global exception (the refresh path runs before any tenant context exists).
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b1';
const USER_B = '0193b3a0-0000-7000-8000-0000000000b2';

const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };

describe('sessions tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: SessionsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new SessionsRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-sess' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });

    const expiresAt = new Date(Date.now() + 60_000);
    await repo.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      familyId: '0193b3a0-0000-7000-8000-0000000000c1',
      refreshTokenHash: 'hash-a',
      expiresAt,
    });
    await repo.create({
      organizationId: ORG_B,
      userId: USER_B,
      familyId: '0193b3a0-0000-7000-8000-0000000000c2',
      refreshTokenHash: 'hash-b',
      expiresAt,
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists only its own active sessions', async () => {
    const a = await tenant.run(ctxA, () => repo.listActiveForUser(SEED_USER_ID));
    expect(a).toHaveLength(1);
    expect(a[0]?.organizationId).toBe(SEED_ORG_ID);

    // Org A can never see org B's user sessions (scoped query).
    expect(await tenant.run(ctxA, () => repo.listActiveForUser(USER_B))).toHaveLength(0);
  });

  it('revokeAllForUser is scoped to its org', async () => {
    await tenant.run(ctxA, () => repo.revokeAllForUser(SEED_ORG_ID, SEED_USER_ID, new Date()));
    // Org B's session is untouched.
    expect(await tenant.run(ctxB, () => repo.listActiveForUser(USER_B))).toHaveLength(1);
  });
});
