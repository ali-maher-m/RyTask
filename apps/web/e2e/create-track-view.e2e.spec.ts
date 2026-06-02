import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

/**
 * Flagship e2e (T045): the core capture → track → view loop (US1 + US2 + US3, SC-005/SC-008).
 *
 *   quick-add an item (US1) → open its detail (US2) → drag it across the Board (US3)
 *   → assert the status changed, an activity entry was logged, and the new column order
 *   persists on reload → run an accessibility scan.
 *
 * Running this requires the full stack up (web :3000 + api :3001 + Postgres seeded), so it
 * is NOT expected to pass in unit/integration CI — it is the demo-gate for the MVP slice.
 * It targets the seeded demo project ("RY") and the Board/List pages delivered in T060/T061.
 */

const PROJECT_ID = '0193b3a0-0000-7000-8000-000000000010'; // SEED_PROJECT_ID
const BOARD_PATH = `/projects/${PROJECT_ID}/board`;

// The M1 surfaces are auth-gated (M0): sign in as the seeded founder before driving the board.
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';

/** Sign in through the real login screen so the bearer token is stored before navigating. */
async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(FOUNDER_EMAIL);
  await page.getByLabel('Password').fill(FOUNDER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'RyTask' })).toBeVisible();
}

/**
 * Drag a card onto a target column using pointer events (works with @dnd-kit). The
 * columns expose only their cards as droppables (SortableContext), so we aim for an
 * existing card in the target column (falling back to the column body) and use an
 * activation nudge + settle moves so @dnd-kit's PointerSensor (distance: 4) reliably
 * starts the drag and resolves a drop target under Playwright's synthetic pointer.
 */
async function dragCardToColumn(page: Page, cardName: string, columnName: string): Promise<void> {
  const card = page.getByTestId('board-card').filter({ hasText: cardName }).first();
  const column = page.getByTestId('board-column').filter({ hasText: columnName }).first();
  await card.scrollIntoViewIfNeeded();

  // The drag listeners live on the card's dedicated ⠿ handle button, not the card body —
  // the pointer-down must start there or @dnd-kit never begins the drag.
  const handle = card.getByRole('button', { name: `Drag ${cardName}` });
  const cardBox = await handle.boundingBox();
  if (!cardBox) throw new Error(`drag handle for "${cardName}" has no bounding box`);

  // Prefer dropping onto an existing card in the target column (a real droppable);
  // otherwise drop on the column body.
  const targetCard = column.getByTestId('board-card').first();
  const target = (await targetCard.count()) > 0 ? targetCard : column;
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error(`column "${columnName}" has no bounding box`);

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Activation nudge: cross the 4px PointerSensor threshold near the origin first.
  await page.mouse.move(startX + 8, startY + 8, { steps: 5 });
  // Travel to the target, then a small settle move so collision detection updates.
  await page.mouse.move(endX, endY, { steps: 15 });
  await page.mouse.move(endX, endY + 4, { steps: 5 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

test('capture → track → view: quick-add, open detail, drag on the board, persist on reload', async ({
  page,
}) => {
  const title = `Ship the board ${Date.now()}`;

  // ── auth (M0): sign in so the gated M1 board loads with a real bearer token ────
  await signIn(page);

  // ── US1: quick-add an item ────────────────────────────────────────────────────
  await page.goto(BOARD_PATH);
  await page.getByTestId('quick-add-input').fill(title);
  await page.getByTestId('quick-add-input').press('Enter');
  const card = page.getByTestId('board-card').filter({ hasText: title }).first();
  await expect(card).toBeVisible();

  // ── US2: open the item detail ─────────────────────────────────────────────────
  await card.click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page
    .getByRole('button', { name: /close|back/i })
    .first()
    .click();

  // ── US3: drag the card from "To Do" to "In Progress" ──────────────────────────
  await dragCardToColumn(page, title, 'In Progress');

  const inProgressColumn = page
    .getByTestId('board-column')
    .filter({ hasText: 'In Progress' })
    .first();
  await expect(inProgressColumn.getByText(title)).toBeVisible();

  // The activity feed records the status change.
  await page.getByTestId('board-card').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('activity-feed')).toContainText(/status|in progress/i);
  await page
    .getByRole('button', { name: /close|back/i })
    .first()
    .click();

  // ── persistence: the move survives a reload (status + column order) ───────────
  await page.reload();
  await expect(inProgressColumn.getByText(title)).toBeVisible();

  // ── a11y: no critical accessibility violations on the board ───────────────────
  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((v) => v.impact === 'critical');
  expect(critical).toEqual([]);
});
