import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';
// Imported via relative path (not the package specifier) so Vite bundles the shared
// preset instead of trying to require a TS file from node_modules.
import { baseConfig } from '../../packages/config/vitest/base';

/**
 * Unit + contract tests. The SWC plugin emits decorator metadata so NestJS DI works
 * under Vitest (esbuild alone does not emit `emitDecoratorMetadata`).
 */
export default mergeConfig(
  baseConfig,
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
      // Many contract specs boot the full Nest `AppModule` + supertest — each is ~one heavy process.
      // Running them in parallel piles several apps into RAM at once (which forces swap + fan spin on
      // smaller machines) AND starves the shared event loop, so a keep-alive HTTP socket can hang up /
      // a response can bleed onto the next request — a flake that lands on a random test. Run the files
      // **in succession** (one app in memory at a time, freed between files). Combined with the
      // RedisModule `error` handler (which absorbs down-Redis connection errors) the DB/Redis-free
      // suite is both deterministic and light on memory.
      fileParallelism: false,
      include: ['src/**/*.spec.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.int.spec.ts',
        '**/*.tenancy.spec.ts',
        '**/*.e2e.spec.ts',
        // US5 cross-cutting suites boot the app against a REAL Postgres → integration config.
        '**/tenant-isolation.suite.spec.ts',
        '**/cross-tenant-id-probe.spec.ts',
        '**/single-org-no-migration.spec.ts',
        // Security suite that signs in against a REAL Postgres → integration config.
        '**/no-secrets-in-logs.spec.ts',
      ],
    },
  }),
);
