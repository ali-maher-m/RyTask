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
import { ApiTokensRepository } from './api-tokens.repository';

/**
 * Cross-tenant isolation for `api_tokens` (T094, FR-TEN-001/003, SC-008). Org A can never
 * list or revoke another org's tokens through the scoped path. `findByHash` is the documented
 * global exception (the verifier runs pre-ALS; the hash is the key).
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000a7';
const USER_B = '0193b3a0-0000-7000-8000-0000000000a8';

const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };

describe('api_tokens tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: ApiTokensRepository;
  let tokenAId: string;
  let tokenBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new ApiTokensRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-pat' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });

    const a = await repo.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      type: 'PAT',
      name: 'A token',
      tokenHash: 'pat-hash-a',
      scopes: ['work:read'],
    });
    const b = await repo.create({
      organizationId: ORG_B,
      userId: USER_B,
      type: 'PAT',
      name: 'B token',
      tokenHash: 'pat-hash-b',
      scopes: ['work:read'],
    });
    tokenAId = a.id;
    tokenBId = b.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists only its own org tokens', async () => {
    const a = await tenant.run(ctxA, () => repo.listForUser(SEED_USER_ID));
    expect(a.map((t) => t.id)).toEqual([tokenAId]);
    expect(await tenant.run(ctxA, () => repo.listForUser(USER_B))).toHaveLength(0);
  });

  it('cannot revoke another org’s token', async () => {
    expect(await tenant.run(ctxA, () => repo.revoke(tokenBId, USER_B, new Date()))).toBe(false);
    expect((await tenant.run(ctxB, () => repo.listForUser(USER_B))).map((t) => t.id)).toEqual([
      tokenBId,
    ]);
  });

  it('findByHash is the documented global exception (verifier path)', async () => {
    expect((await repo.findByHash('pat-hash-a'))?.id).toBe(tokenAId);
    expect((await repo.findByHash('pat-hash-b'))?.id).toBe(tokenBId);
  });
});
