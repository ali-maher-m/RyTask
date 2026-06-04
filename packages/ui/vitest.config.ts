import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * packages/ui primitive test runner (D12). Same jsdom + RTL + vitest-axe setup as the web app,
 * so token-driven primitives can be unit/a11y tested in isolation. `passWithNoTests` keeps
 * `turbo run test` green until primitive tests are added.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
