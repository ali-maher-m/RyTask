import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Agent (MCP) access e2e (T098, US6, FR-WEB-110/111, SC-005). Against the full live stack (web
 * :3000 + api :3001 + seeded Postgres). Verifies the Agent-access page shows the connect steps +
 * the (local stdio) endpoint hint, that a PAT can be minted with its secret shown **exactly once**
 * and then revoked, and that the journey passes axe with zero critical violations. (MCP_PUBLIC_URL
 * is unset in dev, so the remote URL shows its "ask an admin" guidance — the stdio hint always shows.)
 */
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';

async function signInFounder(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
}

test('shows connect steps + endpoint and mints/revokes a PAT (secret shown once)', async ({
  page,
}) => {
  await signInFounder(page);
  await page.goto('/settings/agent-access');
  await expect(page.getByRole('heading', { name: 'Agent access' })).toBeVisible();

  // The connect steps + the always-available local (stdio) endpoint hint are visible.
  await expect(page.getByText('How to connect')).toBeVisible();
  await expect(page.getByTestId('mcp-stdio-hint')).toBeVisible();

  // Mint a PAT — the secret is shown exactly once.
  const tokenName = `agent-${Date.now()}`;
  await page.getByLabel('Name').fill(tokenName);
  await page.getByRole('button', { name: 'Create token' }).click();
  await expect(page.getByTestId('token-secret')).toBeVisible();
  await page.getByRole('button', { name: "I've copied it" }).click();
  await expect(page.getByTestId('token-secret')).toHaveCount(0); // never re-shown

  // The token now appears in the list and can be revoked.
  await expect(page.getByRole('button', { name: `Revoke token ${tokenName}` })).toBeVisible();
  await page.getByRole('button', { name: `Revoke token ${tokenName}` }).click();
  await expect(page.getByRole('button', { name: `Revoke token ${tokenName}` })).toHaveCount(0);

  // Accessibility scan of the Agent-access surface (zero critical violations).
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([]);
});
