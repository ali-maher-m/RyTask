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

async function signInFounder(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
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

  // 2. Owner creates a shareable invite link with the VIEWER role (US9 link-invite UI).
  await page.goto('/settings/members');
  await page.getByRole('heading', { name: 'Members' }).waitFor();
  await page.getByLabel('Create a shareable link').check();
  await page.getByLabel('Role', { exact: true }).selectOption('VIEWER');
  await page.getByRole('button', { name: 'Create invite link' }).click();

  const link = await page.getByTestId('invite-link').innerText();
  expect(link).toContain('/invite/');

  // 3. A brand-new teammate self-onboards from an *addressed* invite. The API provisions a new
  //    account only for an email invite; a shareable link (which carries no address) must be
  //    accepted by an already signed-in user. Mint the Viewer email invite, then drive the real
  //    accept screen in a fresh browser context (no shared session).
  const ownerToken = await accessTokenOf(page.context());
  const inviteEmail = `viewer-${Date.now()}@example.com`;
  const minted = await request.post(`${API_BASE}/api/v1/invites`, {
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    data: { email: inviteEmail, role: 'VIEWER' },
  });
  expect(minted.ok()).toBeTruthy();
  const acceptPath = new URL(((await minted.json()) as { acceptUrl: string }).acceptUrl).pathname;

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(acceptPath);
  await expect(guest.getByRole('heading', { name: /Join / })).toBeVisible();
  await expect(guest.getByText(/Viewer/)).toBeVisible();

  await guest.getByLabel('Your name').fill('Viewer Teammate');
  await guest.getByLabel('Choose a password').fill('viewer-strong-password');
  await guest.getByRole('button', { name: /Join / }).click();
  // Assert the signed-in landing (My Work), not the brand mark: the invite page's "Join RyTask Demo"
  // heading would substring-match "RyTask" and let the next step read localStorage before the accept
  // has stored the session.
  await expect(guest.getByRole('heading', { name: 'My Work' })).toBeVisible();

  // 4. The Viewer's token is rejected for a mutating action (server-side default-deny).
  const viewerToken = await accessTokenOf(guestContext);
  await expectMutationForbidden(request, viewerToken);

  // 5. The Viewer UI hides mutating controls on a board (cosmetic gating, FR-WEB-100). Project data
  //    needs project membership (org role alone doesn't grant it), so the owner first adds the Viewer
  //    to the demo project as a read-only project member; the board then renders read-only — a notice
  //    instead of quick-add (their org VIEWER role still denies writes).
  const viewerId = JSON.parse(Buffer.from(viewerToken.split('.')[1], 'base64url').toString())
    .sub as string;
  const added = await request.post(`${API_BASE}/api/v1/projects/${DEMO_PROJECT_ID}/members`, {
    headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
    data: { userId: viewerId, role: 'VIEWER' },
    failOnStatusCode: false,
  });
  expect(added.ok()).toBeTruthy();

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

test('owner invites a teammate by email and the pending invitation is listed (US9)', async ({
  page,
}) => {
  await signInFounder(page);
  await page.goto('/settings/members');
  await page.getByRole('heading', { name: 'Members' }).waitFor();

  // The default method is "Email an invitation" — fill an address and send.
  const email = `teammate-${Date.now()}@rytask.local`;
  await page.getByLabel('Email an invitation').check();
  await page.getByLabel('Their email').fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption('MEMBER');
  await page.getByRole('button', { name: 'Send invitation' }).click();

  // A plain confirmation, and the address appears under "Pending invitations".
  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible();
  const pending = page.getByRole('list', { name: 'Pending invitations' });
  await expect(pending.getByText(email)).toBeVisible();
});

test('search is reachable from the command palette and stays workspace-scoped (US11)', async ({
  page,
  request,
}) => {
  await signInFounder(page);

  // 1. The command palette opens with Cmd/Ctrl-K from any authed screen and searches live.
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('combobox', { name: 'Search' });
  await expect(palette).toBeVisible();
  await palette.fill('RY');
  // A non-empty query always offers a navigate-or-create path (ranked hits and/or "create").
  await expect(page.getByText(/Create work item/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  // 2. Server-side scoping (FR-WEB-091): search is tenant- AND permission-scoped, never public.
  //    An anonymous request is refused; an authed one returns a `{ data }` envelope of in-workspace
  //    hits only (items in projects this principal can't access are excluded server-side).
  const anon = await request.get(`${API_BASE}/api/v1/search?q=RY`, { failOnStatusCode: false });
  expect(anon.status()).toBe(401);

  const token = await accessTokenOf(page.context());
  const scoped = await request.get(`${API_BASE}/api/v1/search?q=RY`, {
    headers: { authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });
  expect(scoped.status()).toBe(200);
  const body = (await scoped.json()) as { data: Array<{ projectId: string | null }> };
  expect(Array.isArray(body.data)).toBe(true);

  // 3. The full results page renders the same scoped set behind a shareable deep link.
  await page.goto('/search?q=RY');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();

  // 4. Accessibility scan of the search surface.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});

test('owner mints a Personal Access Token shown once, then revokes it (US9)', async ({ page }) => {
  await signInFounder(page);
  await page.goto('/settings/tokens');
  await page.getByRole('heading', { name: 'Access tokens' }).waitFor();

  const tokenName = `CI bot ${Date.now()}`;
  await page.getByLabel('Name').fill(tokenName);
  await page.getByRole('button', { name: 'Create token' }).click();

  // The secret is shown exactly once, with a copy-now affordance.
  const secret = page.getByTestId('token-secret');
  await expect(secret).toBeVisible();
  const secretText = await secret.innerText();
  expect(secretText.length).toBeGreaterThan(0);

  // Dismissing the one-time reveal hides the secret for good; the token is listed (no secret).
  await page.getByRole('button', { name: "I've copied it" }).click();
  await expect(page.getByTestId('token-secret')).toHaveCount(0);
  const row = page.getByTestId('token-row').filter({ hasText: tokenName });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(secretText);

  // Revoking removes it immediately.
  await row.getByRole('button', { name: `Revoke token ${tokenName}` }).click();
  await expect(page.getByTestId('token-row').filter({ hasText: tokenName })).toHaveCount(0);
});
