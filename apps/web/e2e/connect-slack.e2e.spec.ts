import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * Slack connect e2e (T044, US1, FR-WEB-101/103). Against the full live stack (web :3000 + api
 * :3001 + seeded Postgres) — a demo-gate, not a CI unit test. Slack is inert in dev (no env), so
 * this verifies the UI states, not a real OAuth round-trip: an admin sees "Not connected" + an
 * enabled "Connect Slack"; a Viewer sees the page READ-ONLY (a plain reason, no connect control);
 * and the connect-Slack journey passes axe with zero critical violations.
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

test('an admin sees the Slack connect control on a not-connected workspace', async ({ page }) => {
  await signInFounder(page);
  await page.goto('/settings/integrations');
  await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();

  // Slack is inert in dev → "Not connected" with an enabled Connect control for the admin.
  // Scoped to the Slack card: the GitHub card (M5) shows its own "Not connected" badge.
  const slackCard = page.locator('section', {
    has: page.getByRole('heading', { name: 'Slack', exact: true }),
  });
  await expect(slackCard.getByText('Not connected')).toBeVisible();
  await expect(page.getByTestId('connect-slack')).toBeEnabled();

  // Accessibility scan of the connect-Slack surface (zero critical violations).
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});

test('a non-admin sees the integrations page read-only (no connect control)', async ({
  page,
  browser,
  request,
}) => {
  // Owner mints a Viewer email invite via the real API, then the Viewer self-onboards.
  await signInFounder(page);
  const ownerToken = await accessTokenOf(page.context());
  const inviteEmail = `viewer-slack-${Date.now()}@example.com`;
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

  // The Viewer can view status but not manage — no connect control, a plain reason instead.
  await guest.goto('/settings/integrations');
  await expect(guest.getByRole('heading', { name: 'Integrations' })).toBeVisible();
  await expect(guest.getByTestId('connect-slack')).toHaveCount(0);
  await expect(guest.getByTestId('connect-reason')).toBeVisible();

  await guestContext.close();
});
