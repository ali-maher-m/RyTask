import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Web unit/component test runner (D12 / NFR-WEB-006). Vitest + React Testing Library on jsdom,
 * with vitest-axe matchers wired in test/setup.ts. The `@/` path alias mirrors tsconfig so source
 * modules resolve under Vitest. CSS Modules resolve to their (non-scoped) class names so
 * components mount without a real CSS pipeline. `passWithNoTests` keeps `turbo run test` green
 * before a given story's tests land.
 */
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${root}$1` }],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
