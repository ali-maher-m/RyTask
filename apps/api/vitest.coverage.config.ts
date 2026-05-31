import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Merged coverage exit gate (tasks.md T128 / research D18).
 *
 * Runs the WHOLE server suite — unit + contract + integration + tenancy — in a single
 * pass so coverage is merged into one honest number (provider/repository code is only
 * exercised by the integration run against real Postgres, so a unit-only report
 * understates line coverage). Requires a running Docker daemon (testcontainers).
 *
 * Thresholds encode RyTask Constitution Principle V / ARCHITECTURE §14.3:
 *   • server-wide   ≥ 80% line
 *   • domain/ + providers/  ≥ 90% line
 *   • domain policies        ≥ 90% branch
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    // Everything: unit (*.spec), contract (*.spec), integration (*.int.spec), tenancy (*.tenancy.spec).
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.e2e.spec.ts'],
    // Integration tests start real Postgres/Redis containers → forks + generous timeouts.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
    testTimeout: 60_000,
    hookTimeout: 180_000,
    coverage: {
      enabled: true,
      provider: 'v8',
      all: true,
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.config.*',
        '**/module.testplan.ts',
        '**/*.module.ts',
        '**/main.ts',
        '**/index.ts',
        '**/*.event.ts',
        '**/common/testing/**',
      ],
      thresholds: {
        // Server-wide floor (Principle V / ARCHITECTURE §14.3).
        lines: 80,
        statements: 80,
        functions: 80,
        // Raised LINE gate for the domain + provider layers.
        'src/**/domain/**': { lines: 90, statements: 90, functions: 90 },
        'src/**/providers/**': { lines: 90, statements: 90, functions: 90 },
        // Raised BRANCH gate, scoped to the domain *policies* (the rule the
        // constitution names explicitly): every `*.policy.ts`.
        'src/**/domain/**/*.policy.ts': { branches: 90 },
      },
    },
  },
});
