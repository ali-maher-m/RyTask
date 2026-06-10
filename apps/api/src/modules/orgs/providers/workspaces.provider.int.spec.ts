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
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { WorkspacesProvider } from './workspaces.provider';

/**
 * Integration test against REAL PostgreSQL (US1, FR-TEN-002). Proves the tenant-scoped
 * workspace reads: `list()` returns the org's workspaces (mapped to the DTO) and `get(id)`
 * returns one by id or raises 404 for an id absent from the current org.
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

describe('WorkspacesProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: WorkspacesProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    provider = new WorkspacesProvider(new WorkspacesRepository(handle.db, tenant));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('list() → the seeded workspace, mapped to the DTO', async () => {
    const rows = await tenant.run(ctxA, () => provider.list());
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const seeded = rows.find((w) => w.id === SEED_WORKSPACE_ID);
    expect(seeded).toBeDefined();
    expect(seeded?.name).toBeTypeOf('string');
    expect(seeded?.slug).toBeTypeOf('string');
  });

  it('get(id) → the workspace by id', async () => {
    const ws = await tenant.run(ctxA, () => provider.get(SEED_WORKSPACE_ID));
    expect(ws.id).toBe(SEED_WORKSPACE_ID);
  });

  it('get(id) for an id outside the current org → 404', async () => {
    await expect(
      tenant.run(ctxA, () => provider.get('0193b3a0-0000-7000-8000-0000000000ff')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
