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
import { OneTimeTokensRepository } from './one-time-tokens.repository';

/**
 * Cross-tenant isolation for `one_time_tokens` (T086, FR-TEN-001/003, SC-008). Org A can
 * never list another org's reset/verify tokens through the scoped path. `findByHash` is the
 * documented global exception (public verify/reset run pre-ALS; the hash is the key).
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b9';
const USER_B = '0193b3a0-0000-7000-8000-0000000000ba';

const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };
const NOW = new Date('2026-06-02T00:00:00.000Z');
const future = new Date(NOW.getTime() + 60 * 60 * 1000);

describe('one_time_tokens tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: OneTimeTokensRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new OneTimeTokensRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-ott' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });

    await repo.issue({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      purpose: 'PASSWORD_RESET',
      tokenHash: 'ott-hash-a',
      expiresAt: future,
    });
    await repo.issue({
      organizationId: ORG_B,
      userId: USER_B,
      purpose: 'PASSWORD_RESET',
      tokenHash: 'ott-hash-b',
      expiresAt: future,
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists only its own live tokens', async () => {
    const a = await tenant.run(ctxA, () =>
      repo.listLiveForUser(SEED_USER_ID, 'PASSWORD_RESET', NOW),
    );
    expect(a).toHaveLength(1);
    expect(a[0]?.organizationId).toBe(SEED_ORG_ID);
    expect(
      await tenant.run(ctxA, () => repo.listLiveForUser(USER_B, 'PASSWORD_RESET', NOW)),
    ).toHaveLength(0);
  });

  it('findByHash is the documented global exception (public reset path)', async () => {
    expect((await repo.findByHash('ott-hash-a'))?.organizationId).toBe(SEED_ORG_ID);
    expect((await repo.findByHash('ott-hash-b'))?.organizationId).toBe(ORG_B);
  });

  it('consumeAllForUser is scoped to its org', async () => {
    await tenant.run(ctxA, () =>
      repo.consumeAllForUser(SEED_ORG_ID, SEED_USER_ID, 'PASSWORD_RESET', new Date()),
    );
    // Org B's token is untouched.
    expect(
      await tenant.run(ctxB, () => repo.listLiveForUser(USER_B, 'PASSWORD_RESET', NOW)),
    ).toHaveLength(1);
  });
});
