import { type DbHandle, createDb, runMigrations } from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { HealthRepository } from './health.repository';

/**
 * Integration test against a REAL PostgreSQL (testcontainers, §14.1). Proves the
 * provider works end-to-end: migrate → connect → query. Requires a running Docker daemon.
 */
describe('HealthRepository (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let repo: HealthRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    handle = createDb(pg.url);
    // Construct the provider directly with the real db (DI not needed for a unit of work).
    repo = new HealthRepository(handle.db);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('ping() returns true against a live database', async () => {
    expect(await repo.ping()).toBe(true);
  });
});
