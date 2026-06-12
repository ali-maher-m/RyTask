import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    // CI serves the production build — `next dev` cold-compiles heavy routes mid-test and can
    // trip the 30s test timeout; `next start` is deterministic. Local runs keep hot reload.
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
