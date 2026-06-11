import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Page, expect, test } from '@playwright/test';

/**
 * M4 reporting e2e (US1–US4) against the full live stack (web :3000 + api :3001 + seeded Postgres).
 * US1 — the flagship "Where did my time go?" report: seed a planned + an interruption entry, open
 * `/reports`, and assert the narrative + the planned-vs-interruption headline split render and
 * reconcile (`planned + interruption === logged`), then scan `/reports` with axe. US2/US3/US4 extend
 * this file in place (ledger reconciliation, My week + copy-as-text, CSV export).
 *
 * Runs SERIAL: all three stories seed the same (single seeded) project on the same UTC day and assert
 * on its aggregates; running them in parallel would let one story's writes skew another's snapshot
 * (notably US4's exact `Logged,<n>` CSV equality). Serial keeps each aggregate deterministic.
 */
test.describe.configure({ mode: 'serial' });

const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Two landmark rules the app-shell triggers app-wide, NOT introduced by M4: the shell wraps every
 * `(app)` page in its own `<main>`, and each page surface (here `/reports` + `/reports/week`, exactly
 * like `my-work`, `board`, `list`, …) renders its own `<main>` too — so axe sees a nested/duplicate
 * main (both *moderate*). The sibling suites sidestep this by asserting only on `critical` violations
 * (create-track-view, my-work); we instead stay strict on everything else and disable just these two
 * pre-existing shell rules, so a real M4 regression at any severity still fails the scan.
 */
const SHELL_LANDMARK_RULES = ['landmark-no-duplicate-main', 'landmark-main-is-top-level'];

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

/** The Monday (UTC) of the current week — the `weekStart` the My week surface requests. */
function utcMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
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
      data: {
        totals: { loggedSeconds: number; plannedSeconds: number; interruptionSeconds: number };
      };
    }
  ).data.totals;
  expect(totals.plannedSeconds + totals.interruptionSeconds).toBe(totals.loggedSeconds);
  expect(totals.plannedSeconds).toBeGreaterThanOrEqual(3600);
  expect(totals.interruptionSeconds).toBeGreaterThanOrEqual(1800);

  // ── US2: the interruption ledger renders and its footer total equals the headline figure ──
  await expect(page.getByTestId('report-ledger')).toBeVisible();
  const ledgerTotal = (await page.getByTestId('ledger-total').textContent())?.trim();
  const headlineInterruption = (
    await page.getByTestId('report-interruption').textContent()
  )?.trim();
  expect(ledgerTotal).toBe(headlineInterruption);

  // ── a11y: the report surface passes an axe scan (before we navigate away) ──
  const a11y = await new AxeBuilder({ page })
    .include('[data-testid="reports"]')
    .disableRules(SHELL_LANDMARK_RULES)
    .analyze();
  expect(a11y.violations).toEqual([]);

  // A ledger row links to its item detail (the headline number is traceable to a named item).
  await page.getByTestId('report-ledger').getByRole('link').first().click();
  await expect(page.getByTestId('item-detail')).toBeVisible();
});

test('US3: My week shows the split, switches weeks, and copies a matching digest', async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signInFounder(page);
  const token = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;

  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: `My week seed ${Date.now()}` },
  });
  const itemId = ((await created.json()) as { data: { id: string } }).data.id;
  // Log a planned hour on a day inside the current week.
  const res = await request.post(`${API_BASE}/api/v1/work-items/${itemId}/time-logs`, {
    headers,
    data: { durationSeconds: 3600, date: utcToday(), classification: 'PLANNED' },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto(`/reports/week?weekStart=${utcMonday()}`);
  await expect(page.getByTestId('my-week')).toBeVisible();
  await expect(page.getByTestId('week-total')).toContainText(/\d/);

  // Copy as text → the clipboard digest contains the on-screen total (built from the same DTO).
  const weekTotal = (await page.getByTestId('week-total').textContent())?.trim() ?? '';
  await page.getByTestId('copy-week').click();
  await expect(page.getByTestId('copy-feedback')).toContainText(/copied/i);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain(weekTotal);
  expect(clip.startsWith('Week of')).toBeTruthy();

  // The week picker moves back a week and never past the current week.
  const labelBefore = await page.getByTestId('week-label').textContent();
  await page.getByTestId('week-prev').click();
  await expect(page.getByTestId('week-label')).not.toHaveText(labelBefore ?? '');
  await expect(page.getByTestId('week-next')).toBeEnabled(); // a past week → forward is allowed

  // ── a11y: My week passes an axe scan ──
  const a11y = await new AxeBuilder({ page })
    .include('[data-testid="my-week"]')
    .disableRules(SHELL_LANDMARK_RULES)
    .analyze();
  expect(a11y.violations).toEqual([]);
});

test('US4: Export CSV matches the screen, and an empty range exports headers only', async ({
  page,
  request,
}) => {
  await signInFounder(page);
  const token = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;
  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: `CSV seed ${Date.now()}` },
  });
  const itemId = ((await created.json()) as { data: { id: string } }).data.id;
  const day = utcToday();
  for (const entry of [
    { durationSeconds: 3600, date: day, classification: 'PLANNED' },
    { durationSeconds: 1800, date: day, classification: 'INTERRUPTION' },
  ]) {
    await request.post(`${API_BASE}/api/v1/work-items/${itemId}/time-logs`, {
      headers,
      data: entry,
    });
  }

  // The on-screen total (via the API), then the exported CSV for the same range/scope.
  const ov = await request.get(
    `${API_BASE}/api/v1/time/reports/overview?from=${day}&to=${day}&projectId=${projectId}`,
    { headers },
  );
  const logged = ((await ov.json()) as { data: { totals: { loggedSeconds: number } } }).data.totals
    .loggedSeconds;

  await page.goto(`/reports?preset=custom&from=${day}&to=${day}&projectId=${projectId}`);
  await expect(page.getByTestId('reports')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-csv').click(),
  ]);
  expect(download.suggestedFilename()).toBe(`rytask-report-${day}-${day}.csv`);
  const csvPath = await download.path();
  const csv = csvPath ? readFileSync(csvPath, 'utf8') : '';
  expect(csv).toContain('Summary');
  expect(csv).toContain('Interruption ledger');
  expect(csv).toContain('By week');
  expect(csv).toContain(`Logged,${logged},`);

  // An empty far-past Monday → a valid headers-only CSV (no interruption item rows).
  await page.goto(`/reports?preset=custom&from=2020-01-06&to=2020-01-06&projectId=${projectId}`);
  await expect(page.getByTestId('reports-empty')).toBeVisible();
  const [emptyDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-csv').click(),
  ]);
  const emptyPath = await emptyDownload.path();
  const emptyCsv = emptyPath ? readFileSync(emptyPath, 'utf8') : '';
  expect(emptyCsv).toContain('Key,Title,Source,Raised by,Entries,Seconds,Time');
  expect(emptyCsv).toContain('Logged,0,0m');
});
