import { NotFoundException } from '@nestjs/common';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { GetOrgProvider } from './get-org.provider';

/**
 * Integration test against REAL PostgreSQL (US1 AC4, FR-TEN-004). Proves `current()` reads the
 * org resolved from ALS (never the body) and maps it to the DTO, and that a tenant context
 * pointing at a non-existent org raises 404.
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

describe('GetOrgProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: GetOrgProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    provider = new GetOrgProvider(new OrganizationsRepository(handle.db, tenant));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('current() → the seeded org with id, name, slug, settings', async () => {
    const org = await tenant.run(ctxA, () => provider.current());
    expect(org.id).toBe(SEED_ORG_ID);
    expect(org.name).toBeTypeOf('string');
    expect(org.slug).toBeTypeOf('string');
    expect(org.settings).toBeTypeOf('object');
  });

  it('a tenant context for a non-existent org → 404', async () => {
    await expect(
      tenant.run(
        { organizationId: '0193b3a0-0000-7000-8000-0000000000ff', userId: SEED_USER_ID },
        () => provider.current(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
