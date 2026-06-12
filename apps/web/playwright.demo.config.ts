import { defineConfig, devices } from '@playwright/test';

// Throwaway config used only to RECORD the README demo GIF — not part of the test suite.
// It records video of a single scripted journey against the already-running docker stack
// (web :3000 + api :3001 + seeded Postgres). Run with:
//   pnpm --filter @rytask/web exec playwright test -c playwright.demo.config.ts
export default defineConfig({
  testDir: './e2e',
  testMatch: /demo-recording\.e2e\.spec\.ts/,
  timeout: 120_000,
  retries: 0,
  workers: 1,
  outputDir: './demo-artifacts',
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { slowMo: 250 },
  },
  // No webServer — the docker stack already serves :3000.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
