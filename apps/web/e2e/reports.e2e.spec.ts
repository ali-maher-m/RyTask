import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Page, expect, test } from '@playwright/test';

/**
 * M4 reporting e2e (US1–US4) against the full live stack (web :3000 + api :3001 + seeded Postgres).
 * US1 — the flagship "Where did my time go?" report: seed a planned + an interruption entry, open
 * `/reports`, and assert the narrative + the planned-vs-interruption headline split render and
 * reconcile (`planned + interruption === logged`), then scan `/reports` with axe. US2/US3/US4 extend
 * this file in place (ledger reconciliation, My week + copy-as-text, CSV export).
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

/** UTC `YYYY-MM-DD` for today — both the seeded entries' day and the report range bucket (D5). */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

test('US1: report shows the planned-vs-interruption split, narrative, and reconciles', async ({
  page,
  request,
}) => {
  await signInFounder(page);
  const token = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;

  // A fresh item with one planned + one interruption manual entry, both dated today (UTC).
  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: `Report seed ${Date.now()}` },
  });
  expect(created.ok()).toBeTruthy();
  const itemId = ((await created.json()) as { data: { id: string } }).data.id;
  const day = utcToday();

  for (const entry of [
    { durationSeconds: 3600, date: day, classification: 'PLANNED' },
    { durationSeconds: 1800, date: day, classification: 'INTERRUPTION' },
  ]) {
    const res = await request.post(`${API_BASE}/api/v1/work-items/${itemId}/time-logs`, {
      headers,
      data: entry,
    });
    expect(res.ok()).toBeTruthy();
  }

  // Open the report for exactly today, scoped to this project.
  await page.goto(`/reports?preset=custom&from=${day}&to=${day}&projectId=${projectId}`);
  await expect(page.getByTestId('reports')).toBeVisible();

  // The narrative + the three headline figures render with real time.
  await expect(page.getByTestId('report-narrative')).toContainText(/tracked/i);
  await expect(page.getByTestId('report-total')).toContainText(/\d/);
  await expect(page.getByTestId('report-planned')).toContainText(/\d/);
  await expect(page.getByTestId('report-interruption')).toContainText(/\d/);

  // Reconciliation is asserted exactly at the source (the figures floor to minutes): the overview
  // DTO for the same range/scope must satisfy planned + interruption === logged, with both > 0.
  const overviewRes = await request.get(
    `${API_BASE}/api/v1/time/reports/overview?from=${day}&to=${day}&projectId=${projectId}`,
    { headers },
  );
  expect(overviewRes.ok()).toBeTruthy();
  const totals = (
    (await overviewRes.json()) as {
      data: { totals: { loggedSeconds: number; plannedSeconds: number; interruptionSeconds: number } };
    }
  ).data.totals;
  expect(totals.plannedSeconds + totals.interruptionSeconds).toBe(totals.loggedSeconds);
  expect(totals.plannedSeconds).toBeGreaterThanOrEqual(3600);
  expect(totals.interruptionSeconds).toBeGreaterThanOrEqual(1800);

  // ── US2: the interruption ledger renders and its footer total equals the headline figure ──
  await expect(page.getByTestId('report-ledger')).toBeVisible();
  const ledgerTotal = (await page.getByTestId('ledger-total').textContent())?.trim();
  const headlineInterruption = (await page.getByTestId('report-interruption').textContent())?.trim();
  expect(ledgerTotal).toBe(headlineInterruption);

  // ── a11y: the report surface passes an axe scan (before we navigate away) ──
  const a11y = await new AxeBuilder({ page }).include('[data-testid="reports"]').analyze();
  expect(a11y.violations).toEqual([]);

  // A ledger row links to its item detail (the headline number is traceable to a named item).
  await page.getByTestId('report-ledger').getByRole('link').first().click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
});
