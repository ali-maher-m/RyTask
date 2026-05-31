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
    coverage: { enabled: false },
  },
});

export default integrationConfig;
