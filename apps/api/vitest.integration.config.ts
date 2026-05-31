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
      include: ['src/**/*.int.spec.ts'],
    },
  }),
);
