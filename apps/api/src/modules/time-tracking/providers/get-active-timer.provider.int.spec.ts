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
import { TimersRepository } from '../repositories/timers.repository';
import { GetActiveTimerProvider } from './get-active-timer.provider';

/**
 * Integration test against REAL PostgreSQL (T021, §14.1). The seed gives the founder one running
 * timer; the provider returns it (zero-or-one) and returns null once it's gone. A user with no timer
 * gets null — never another user's timer (tenant + owner scoped).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const OTHER_USER = '0193b3a0-0000-7000-8000-0000000000ff';

describe('GetActiveTimerProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: GetActiveTimerProvider;
  let timers: TimersRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    timers = new TimersRepository(handle.db, tenant);
    provider = new GetActiveTimerProvider(timers, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('returns the founder seeded running timer', async () => {
    const active = await tenant.run(CTX, () => provider.getActive());
    expect(active).not.toBeNull();
    expect(active?.startedAt).toBeTypeOf('string');
  });

  it('returns null for a user who has no timer (never another users)', async () => {
    const active = await tenant.run({ ...CTX, userId: OTHER_USER }, () => provider.getActive());
    expect(active).toBeNull();
  });

  it('returns null after the timer is removed', async () => {
    const active = await tenant.run(CTX, () => provider.getActive());
    if (active) {
      // Resolve to the row id and delete it, then re-read.
      const row = await tenant.run(CTX, () => timers.findActiveForUser(SEED_USER_ID));
      await tenant.run(CTX, () => timers.delete(row?.id ?? ''));
    }
    const afterDelete = await tenant.run(CTX, () => provider.getActive());
    expect(afterDelete).toBeNull();
  });
});
