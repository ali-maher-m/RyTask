import { defineConfig } from 'vitest/config';

/**
 * Shared unit + contract test preset.
 * Integration tests (real Postgres) and E2E run under separate presets.
 *
 * NOTE: coverage thresholds are intentionally NOT enforced at the scaffold stage
 * (most modules have no code yet). M0 raises these to the ARCHITECTURE §14.3 gates:
 *   line >= 80% (>= 90% in domain/ + providers/), branch >= 90% on domain policies.
 */
export const baseConfig = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.int.spec.ts', '**/*.e2e.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.int.spec.ts',
        '**/*.config.*',
        '**/module.testplan.ts',
      ],
    },
  },
});

export default baseConfig;
