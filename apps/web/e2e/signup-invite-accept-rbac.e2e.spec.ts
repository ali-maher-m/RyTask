import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, type BrowserContext, expect, test } from '@playwright/test';

/**
 * Flagship identity e2e (T073, US2+US3+US4, research D17, SC-004/005/006). The end-to-end M0 loop:
 *
 *   owner signs in → invites a teammate (shareable link, VIEWER role) → the teammate accepts in a
 *   fresh browser and lands signed in at exactly that role → a role-gated mutation is denied (403)
 *   server-side for the Viewer, proving RBAC is enforced for tokens just as for the UI.
 *
 * Running this requires the full stack (web :3000 + api :3001 + seeded Postgres), so — like the M1
 * flagship — it is a demo-gate, not a unit/integration CI test. It signs in as the seeded founder
 * (`founder@rytask.local`) and drives the real screens shipped in T059/T108/T069.
 */
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const DEMO_PROJECT_ID = '0193b3a0-0000-7000-8000-000000000010'; // SEED_PROJECT_ID
// A well-formed id that belongs to no project this principal can see (tenant-safe deep-link probe).
const UNKNOWN_PROJECT_ID = '00000000-0000-7000-8000-0000000000ff';

async function accessTokenOf(context: BrowserContext): Promise<string> {
  const [page] = context.pages();
  const token = await page.evaluate(() => window.localStorage.getItem('rytask.accessToken'));
  if (!token) throw new Error('expected an access token in localStorage after auth');
  return token;
}

async function expectMutationForbidden(request: APIRequestContext, token: string): Promise<void> {
  // A Viewer is read-only: a representative mutation must be refused server-side (default-deny).
  const res = await request.post(`${API_BASE}/api/v1/projects`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { name: 'Viewer should not create this', keyPrefix: 'VWR' },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(403);
}

test('owner invites a Viewer who accepts and is then denied a mutating action (RBAC)', async ({
  page,
  browser,
  request,
}) => {
  // 1. Owner signs in.
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();

  // 2. Owner creates a shareable invite link with the VIEWER role.
  await page.goto('/settings/members');
  await page.getByRole('heading', { name: 'Members' }).waitFor();
  await page.getByLabel('Create a shareable link').check();
  await page.getByLabel('Role').selectOption('VIEWER');
  await page.getByRole('button', { name: 'Create invite link' }).click();

  const link = await page.getByTestId('invite-link').innerText();
  expect(link).toContain('/invite/');
  const acceptPath = new URL(link).pathname;

  // 3. The teammate accepts in a fresh browser context (no shared session).
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(acceptPath);
  await expect(guest.getByRole('heading', { name: /Join / })).toBeVisible();
  await expect(guest.getByText(/Viewer/)).toBeVisible();

  const unique = `${Date.now()}`;
  await guest.getByLabel('Your name').fill(`Viewer ${unique}`);
  await guest.getByLabel('Choose a password').fill('viewer-strong-password');
  await guest.getByRole('button', { name: /Join / }).click();
  await expect(guest.getByRole('heading', { name: 'RyTask' })).toBeVisible();

  // 4. The Viewer's token is rejected for a mutating action (server-side default-deny).
  const viewerToken = await accessTokenOf(guestContext);
  await expectMutationForbidden(request, viewerToken);

  // 5. The Viewer UI hides mutating controls on a board (cosmetic gating, FR-WEB-100): no quick-add,
  //    a read-only notice instead.
  await guest.goto(`/projects/${DEMO_PROJECT_ID}/board`);
  await expect(guest.getByTestId('board-readonly')).toBeVisible();
  await expect(guest.getByTestId('quick-add-input')).toHaveCount(0);

  // 6. A deep link outside this principal's tenant/permission lands on a friendly not-found/forbidden
  //    with ZERO foreign data rendered (FR-WEB-101, D10).
  await guest.goto(`/projects/${UNKNOWN_PROJECT_ID}/board`);
  await expect(guest.getByText(/couldn’t find|don’t have access/i)).toBeVisible();
  await expect(guest.getByTestId('board-card')).toHaveCount(0);

  // 7. Accessibility scan of the accept landing.
  await guest.goto(acceptPath);
  const results = await new AxeBuilder({ page: guest }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);

  await guestContext.close();
});
