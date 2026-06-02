import { defineConfig } from 'vitest/config';

/**
 * Integration preset — tests run against a REAL PostgreSQL (testcontainers),
 * never mocks (ARCHITECTURE §14.1). Tests spin their own container via
 * `startPostgres()` from '@rytask/config/testing/postgres' in beforeAll/afterAll.
 */
export const integrationConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.int.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
    // Each suite boots its OWN Postgres testcontainer in beforeAll — a real container + a full Nest
    // app is heavy. Running them in parallel spins several containers + apps at once, which fills RAM
    // (swap + fan spin on smaller machines) and starves Docker so beforeAll exceeds hookTimeout. Run
    // the suites **in succession** — one container in memory at a time. Slower wall-clock, but stable
    // and friendly to a developer laptop.
    fileParallelism: false,
    poolOptions: { forks: { maxForks: 1, minForks: 1 } },
    coverage: { enabled: false },
  },
});

export default integrationConfig;
