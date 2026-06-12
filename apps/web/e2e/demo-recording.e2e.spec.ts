import { type BrowserContext, type Page, expect, test } from '@playwright/test';

/**
 * THROWAWAY — records the README demo GIF, not a real test. Drives the live docker stack through the
 * signature journey so Playwright captures a video we convert to a GIF:
 *   Slack-style quick-add → it appears → open it → start timer (ticks) → manual entry over budget →
 *   meter turns red → weekly report.
 * Deliberately paced (pause() beats) so the GIF is watchable. Run via playwright.demo.config.ts.
 */
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const beat = (page: Page, ms = 1400) => page.waitForTimeout(ms);

async function accessTokenOf(context: BrowserContext): Promise<string> {
  const [page] = context.pages();
  const token = await page.evaluate(() => window.localStorage.getItem('rytask.accessToken'));
  if (!token) throw new Error('expected an access token in localStorage after auth');
  return token;
}

async function signInFounder(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
}

test('demo reel', async ({ page, request }) => {
  await signInFounder(page);
  await beat(page);

  const token = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;

  // ── Beat 1+2: capture the Slack way; recognized tokens preview as chips, then it appears ──
  await page.goto(`/projects/${projectId}/list`);
  const input = page.getByTestId('quick-add-input');
  await expect(input).toBeVisible();
  await input.click();
  await input.pressSequentially('Fix signup redirect @marissa #bug !high ^today', { delay: 55 });
  await beat(page, 1600);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await beat(page, 1800);

  // ── Beat 3: open the freshest item (top of the list) ──
  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: 'Polish the onboarding empty-state' },
  });
  const key = ((await created.json()) as { data: { key: string } }).data.key;
  await page.goto(`/projects/${projectId}/items/${key}`);
  const detail = page.getByTestId('item-detail');
  await expect(detail).toBeVisible();
  await beat(page);

  // A 1h estimate gives the meter a planned tick to fill toward, then exceed.
  const estimate = detail.getByLabel('Estimate');
  await estimate.fill('1');
  await estimate.blur();
  await beat(page);

  // ── Beat 3 (cont.): start the timer — it ticks live ──
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Stop timer');
  await expect(page.getByTestId('timer-elapsed')).toBeVisible();
  await beat(page, 2600);
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Start timer');
  await beat(page);

  // ── Beat 4+5: a manual 2h entry pushes past the 1h estimate → meter turns red (over budget) ──
  await page.getByLabel('Hours').fill('2');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByTestId('time-tracking')).toContainText(/over/i);
  await beat(page, 2400);

  // Show the same over-budget meter inside the list row.
  await page.goto(`/projects/${projectId}/list`);
  const row = page
    .getByTestId('work-item-row')
    .filter({ has: page.getByText(key, { exact: true }) });
  await expect(row.getByRole('meter')).toBeVisible({ timeout: 15_000 });
  await beat(page, 2200);

  // ── Beat 6: it rolls up into the weekly report ──
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main').first()).toBeVisible({ timeout: 20_000 });
  await beat(page, 3000);
});
