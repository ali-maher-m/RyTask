import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * Slack user-mapping e2e (T093, US5, FR-WEB-102). Against the full live stack (web :3000 + api
 * :3001 + seeded Postgres) — a demo-gate, not a CI unit test. Slack is inert in dev (no env), so
 * there is no connected workspace to map: this verifies the admin-only page renders its
 * "not connected" guidance with zero critical axe violations, and that a non-admin is shown the
 * forbidden state (the server's GET /users is admin-only). The list/map/unlink/highlight behaviour
 * is proven against real Postgres in `map-slack-user.provider.int.spec.ts` + the admin contract spec.
 */
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function accessTokenOf(context: BrowserContext): Promise<string> {
  const [page] = context.pages();
  const token = await page.evaluate(() => window.localStorage.getItem('rytask.accessToken'));
  if (!token) throw new Error('expected an access token in localStorage after auth');
  return token;
}

async function signInFounder(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
}

test('an admin sees the Slack-users page (not-connected guidance) and it passes axe', async ({
  page,
}) => {
  await signInFounder(page);
  await page.goto('/settings/integrations/slack-users');
  await expect(page.getByRole('heading', { name: 'Slack users' })).toBeVisible();
  // Slack is inert in dev → the page guides the admin to connect first.
  await expect(page.getByText('Slack isn’t connected')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});

test('a non-admin is shown the forbidden state on the Slack-users page', async ({
  page,
  browser,
  request,
}) => {
  await signInFounder(page);
  const ownerToken = await accessTokenOf(page.context());
  const inviteEmail = `viewer-slackmap-${Date.now()}@example.com`;
  const minted = await request.post(`${API_BASE}/api/v1/invites`, {
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    data: { email: inviteEmail, role: 'VIEWER' },
  });
  expect(minted.ok()).toBeTruthy();
  const acceptPath = new URL(((await minted.json()) as { acceptUrl: string }).acceptUrl).pathname;

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(acceptPath);
  await guest.getByLabel('Your name').fill('Viewer Teammate');
  await guest.getByLabel('Choose a password').fill('viewer-strong-password');
  await guest.getByRole('button', { name: /Join / }).click();
  await expect(guest.getByRole('heading', { name: 'My Work' })).toBeVisible();

  await guest.goto('/settings/integrations/slack-users');
  await expect(guest.getByText('Admins only')).toBeVisible();
  await expect(guest.getByTestId('slack-users-table')).toHaveCount(0);

  await guestContext.close();
});
