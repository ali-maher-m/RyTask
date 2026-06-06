import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('home page routes an unauthenticated visitor to sign-in with no critical accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  // Authed-by-default shell (D6/D18, FR-WEB-002): `/` → `/my-work`, and an unauthenticated hit on a
  // protected route lands on sign-in. (The brand "RyTask" h1 lives inside the signed-in shell.)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical).toEqual([]);
});

test('system status page is reachable', async ({ page }) => {
  await page.goto('/health');
  await expect(page.getByRole('heading', { name: 'System status' })).toBeVisible();
});
