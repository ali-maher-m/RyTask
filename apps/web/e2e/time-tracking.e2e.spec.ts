import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Page, expect, test } from '@playwright/test';

/**
 * Flagship time-tracking e2e (T083, US1/US2/US3, SC-001/003/004/007) against the full live stack
 * (web :3000 + api :3001 + seeded Postgres). The signature journey on a fresh item:
 *   start a timer → see it tick → reload (still running, correct elapsed) → stop (an entry appears) →
 *   add a manual entry → the plan-vs-actual meter fills, then turns over-budget (red) once logged
 *   exceeds the estimate → an `@axe-core/playwright` scan of the time UI passes.
 * Server time is the source of truth, so the running timer survives the reload.
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

async function signInFounder(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
}

test('start → tick → reload → stop → manual entry → meter goes over-budget (red)', async ({
  page,
  request,
}) => {
  await signInFounder(page);
  const session = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${session}`, 'content-type': 'application/json' };

  // A fresh item (no prior logs) so the meter math is deterministic.
  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;
  const stamp = Date.now();
  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: `Flagship timer ${stamp}` },
  });
  expect(created.ok()).toBeTruthy();
  const key = ((await created.json()) as { data: { key: string } }).data.key;

  await page.goto(`/projects/${projectId}/items/${key}`);
  const detail = page.getByTestId('item-detail');
  await expect(detail).toBeVisible();

  // A 1-hour estimate gives the meter a planned tick to fill toward (then exceed).
  const estimate = detail.getByLabel('Estimate');
  await estimate.fill('1');
  await estimate.blur();

  // ── Start: the timer ticks live (derived from the server startedAt) ──
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Stop timer');
  await expect(page.getByTestId('timer-elapsed')).toBeVisible();

  // ── Reload: the running timer survives (server is the source of truth) ──
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Stop timer');
  await expect(page.getByTestId('timer-elapsed')).toBeVisible();

  // ── Stop: the span finalizes into an entry; the meter fills but is still UNDER budget ──
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Start timer');
  await expect(page.getByTestId('time-entry').first()).toBeVisible();
  await expect(page.getByTestId('time-tracking')).not.toContainText(/over/i);

  // ── Manual entry: 2h pushes total past the 1h estimate → over-budget (red) ──
  await page.getByLabel('Hours').fill('2');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByTestId('time-entry')).toHaveCount(2);
  await expect(page.getByTestId('time-tracking')).toContainText(/over/i);

  // The in-row meter on the List view reflects the same over-budget item (filter by the item key,
  // which renders as text — the title is an editable input and isn't matched by hasText).
  await page.goto(`/projects/${projectId}/list`);
  const row = page.getByTestId('work-item-row').filter({ hasText: key });
  await expect(row.getByRole('meter')).toBeVisible();

  // ── a11y: the time UI passes an axe scan ──
  await page.goto(`/projects/${projectId}/items/${key}`);
  await expect(page.getByTestId('time-tracking')).toBeVisible();
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
});
