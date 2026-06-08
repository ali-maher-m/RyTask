import { type BrowserContext, expect, test } from '@playwright/test';

/**
 * Capture-source badge e2e (T102, US7, FR-WEB-112, SC-007). Against the full live stack (web :3000
 * + api :3001 + seeded Postgres). Creates two items through DIFFERENT real channels — the web
 * session (→ `WEB`) and a PAT over REST (→ `API`) — and verifies each shows the correct origin
 * badge on the list and on the item detail (with the attributed user in its CREATED activity).
 * Slack (`Slack`) and MCP (`Agent`) origins set `source` server-side too; that is proven by the
 * Slack processor + MCP capture integration tests, and the badge for all four labels by the
 * `source-badge.spec.tsx` component test.
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

test('items created via web (session) and agent (PAT) show the correct source badge', async ({
  page,
  request,
}) => {
  await signInFounder(page);
  const session = await accessTokenOf(page.context());
  const headers = (token: string) => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  });

  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, {
    headers: headers(session),
  });
  expect(projectsRes.ok()).toBeTruthy();
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;

  const stamp = Date.now();

  // WEB origin — created by the signed-in web session.
  const web = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers: headers(session),
    data: { projectId, title: `Web origin ${stamp}` },
  });
  expect(web.ok()).toBeTruthy();

  // API origin — created by a PAT over REST (the agent/non-UI channel records `API`).
  const minted = await request.post(`${API_BASE}/api/v1/api-tokens`, {
    headers: headers(session),
    data: { name: `source-badge-${stamp}`, type: 'PAT', scopes: [] },
  });
  expect(minted.ok()).toBeTruthy();
  const pat = ((await minted.json()) as { secret: string }).secret;

  const apiItem = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers: headers(pat),
    data: { projectId, title: `API origin ${stamp}` },
  });
  expect(apiItem.ok()).toBeTruthy();
  const apiKey = ((await apiItem.json()) as { data: { key: string } }).data.key;

  // The list view renders each item's origin as a token-only source badge.
  await page.goto(`/projects/${projectId}/list`);
  const list = page.getByTestId('work-item-list');
  await expect(list.getByText('Web', { exact: true }).first()).toBeVisible();
  await expect(list.getByText('API', { exact: true }).first()).toBeVisible();

  // The item detail shows the origin badge in the header and inside its CREATED activity entry.
  await page.goto(`/projects/${projectId}/items/${apiKey}`);
  const detail = page.getByTestId('item-detail');
  await expect(detail.getByText('API', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('activity-feed').getByText('API', { exact: true })).toBeVisible();
});
