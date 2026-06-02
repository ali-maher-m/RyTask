import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';
import { integrationConfig } from '../../packages/config/vitest/integration';

/**
 * Integration tests against REAL PostgreSQL (testcontainers). Requires a running
 * Docker daemon. SWC plugin keeps decorator metadata working for any Nest classes.
 */
export default mergeConfig(
  integrationConfig,
  defineConfig({
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
      // Tenancy-isolation specs also use real Postgres → run under the integration suite.
      // The US5 cross-cutting suites boot the whole app against a real Postgres too.
      include: [
        'src/**/*.int.spec.ts',
        'src/**/*.tenancy.spec.ts',
        'src/common/testing/tenant-isolation.suite.spec.ts',
        'src/common/testing/cross-tenant-id-probe.spec.ts',
        'src/common/testing/single-org-no-migration.spec.ts',
        // Drives a real sign-in/refresh against real Postgres to inspect stored secrets + logs.
        'src/common/testing/no-secrets-in-logs.spec.ts',
      ],
    },
  }),
);
