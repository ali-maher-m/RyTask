import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * First-run wizard e2e (T034, US1, SC-001). On a CLEAN instance, `/setup` walks a non-technical
 * wizard (≤ 5 steps) that creates the organization, owner, workspace, and a starter project, then
 * lands the owner in a usable, owned workspace — with no jargon. On an already-bootstrapped
 * instance (the seeded demo), `/setup` self-closes and routes to sign-in instead.
 *
 * Running the create path requires the full stack against an EMPTY database (web :3000 + api :3001
 * + fresh Postgres), so — like the M1 flagship e2e — it is a demo-gate, not a unit/integration CI
 * test. The spec adapts to whichever state the instance is in and accessibility-scans both.
 */
test('first-run wizard reaches a usable workspace (or self-closes if already set up)', async ({
  page,
}) => {
  await page.goto('/setup');

  const wizardHeading = page.getByRole('heading', { name: 'Welcome to RyTask' });
  const closedHeading = page.getByRole('heading', { name: "You're all set up" });

  // Wait for the GET /setup probe to resolve into one of the two states.
  await expect(wizardHeading.or(closedHeading)).toBeVisible();

  if (await closedHeading.isVisible()) {
    // Already bootstrapped: the wizard is closed and points the user to sign in.
    await expect(page.getByRole('link', { name: 'Go to sign in' })).toBeVisible();
  } else {
    // Clean instance: complete the wizard in ≤ 5 plain-language steps.
    const unique = `${Date.now()}`;

    await page.getByLabel('Your name').fill('Marissa Owner');
    await page.getByLabel('Your email').fill(`owner+${unique}@example.com`);
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Choose a password').fill('a-strong-passphrase');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('What should we call your team?').fill('Marissa Co');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Review step → create.
    await page.getByRole('button', { name: 'Create my workspace' }).click();

    // Lands signed in on the home/workspace screen (the shell).
    await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();

    // The session survives a reload (the bearer token is persisted; US1.4, FR-WEB-012).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();

    // Sign out ends the session cleanly → back to sign-in.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // Reopening /setup no longer offers onboarding (the instance is bootstrapped).
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: "You're all set up" })).toBeVisible();
  }

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical).toEqual([]);
});

test('password reset is indistinguishable for known and unknown emails (US12, no enumeration)', async ({
  page,
}) => {
  // The confirmation paragraph names the entered address; strip it to compare the wording itself.
  const stripEmail = (t: string) =>
    t
      .replace(/\S+@\S+/, '<email>')
      .replace(/\s+/g, ' ')
      .trim();
  const confirmation = () =>
    page
      .locator('p', { hasText: /sent a link to reset your password/i })
      .first()
      .innerText();

  // An address that (almost certainly) does not exist.
  await page.goto('/reset');
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@rytask.local`);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const unknownMsg = stripEmail(await confirmation());

  // The seeded founder address — whether or not it exists on this instance, the reply is uniform.
  await page.goto('/reset');
  await page.getByLabel('Email').fill('founder@rytask.local');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const knownMsg = stripEmail(await confirmation());

  // Identical wording → the page reveals nothing about account existence (FR-WEB-013, SC-010).
  expect(knownMsg).toBe(unknownMsg);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});

test('email verification surfaces a plain result for missing and invalid links (US12)', async ({
  page,
}) => {
  // No token → a plain prompt, with no verification attempt and no scary error.
  await page.goto('/verify');
  await expect(page.getByRole('heading', { name: 'Verification link needed' })).toBeVisible();

  // A bogus/expired token → the attempt is rejected with a plain "no longer valid" message. (The
  // success path that lifts the unverified-account restriction needs a real emailed token, exercised
  // via the mail catcher in a full demo run.)
  await page.goto('/verify?token=not-a-real-verification-token');
  await expect(page.getByRole('heading', { name: "This link didn't work" })).toBeVisible();
  await expect(page.getByText(/no longer valid/i)).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});

test('setup wizard exposes a clear step indicator and no developer jargon', async ({ page }) => {
  await page.goto('/setup');

  const wizardHeading = page.getByRole('heading', { name: 'Welcome to RyTask' });
  const closedHeading = page.getByRole('heading', { name: "You're all set up" });
  await expect(wizardHeading.or(closedHeading)).toBeVisible();

  if (await wizardHeading.isVisible()) {
    // A plain "Step 1 of N" indicator orients non-technical users (the Albert/Marissa test).
    await expect(page.getByText(/Step \d of \d/)).toBeVisible();
    // No raw technical terms leak into the first-run copy.
    const body = (await page.locator('main').innerText()).toLowerCase();
    for (const jargon of ['jwt', 'tenant', 'postgres', 'argon2', 'oauth']) {
      expect(body).not.toContain(jargon);
    }
  }
});
