import { type BrowserContext, type Page, expect, test } from '@playwright/test';

/**
 * THROWAWAY — records the README/launch demo, not a real test. Each scene is paced to match a
 * narration clip (1.mp3 … 6.mp3) so the voiceover lines up. Scene boundaries are held by a wall
 * clock from `t0`, so however long the actions take, each scene lasts at least its target.
 * Run via playwright.demo.config.ts, then mux the audio with ffmpeg.
 */
const FOUNDER_EMAIL = 'founder@rytask.local';
const FOUNDER_PASSWORD = 'rytask-dev-password';
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Narration clip lengths (seconds) → cumulative scene-END targets (ms).
const CLIPS = [10.344, 7.967, 5.512, 9.326, 6.504, 5.982];
const LEAD_IN_MS = 700; // pre-roll absorbed before scene 1 (trimmed off in ffmpeg)
const ENDS: number[] = [];
{
  let acc = LEAD_IN_MS;
  for (const c of CLIPS) {
    acc += Math.round(c * 1000);
    ENDS.push(acc);
  }
}

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

test('demo reel', async ({ page, request }) => {
  // Auth + data setup happen BEFORE t0 so they don't eat into scene timing.
  await signInFounder(page);
  const token = await accessTokenOf(page.context());
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const projectsRes = await request.get(`${API_BASE}/api/v1/projects?limit=1`, { headers });
  const projectId = ((await projectsRes.json()) as { data: Array<{ id: string }> }).data[0].id;
  await page.goto(`/projects/${projectId}/list`);
  await expect(page.getByTestId('quick-add-input')).toBeVisible();

  const t0 = Date.now();
  const holdUntil = async (sceneEndMs: number) => {
    const remaining = sceneEndMs - (Date.now() - t0);
    if (remaining > 0) await page.waitForTimeout(remaining);
  };

  // pre-roll
  await page.waitForTimeout(LEAD_IN_MS);

  // ── Scene 1 (1.mp3): capture the Slack way ──
  const input = page.getByTestId('quick-add-input');
  await input.click();
  await input.pressSequentially('Fix signup redirect @marissa #bug !high ^today', { delay: 90 });
  await holdUntil(ENDS[0]);

  // ── Scene 2 (2.mp3): it parses the tokens; the task appears ──
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const created = await request.post(`${API_BASE}/api/v1/work-items`, {
    headers,
    data: { projectId, title: 'Polish the onboarding empty-state' },
  });
  const key = ((await created.json()) as { data: { key: string } }).data.key;
  await holdUntil(ENDS[1]);

  // ── Scene 3 (3.mp3): open it, set an estimate, start the timer ──
  await page.goto(`/projects/${projectId}/items/${key}`);
  const detail = page.getByTestId('item-detail');
  await expect(detail).toBeVisible();
  const estimate = detail.getByLabel('Estimate');
  await estimate.fill('1');
  await estimate.blur();
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Stop timer');
  await holdUntil(ENDS[2]);

  // ── Scene 4 (4.mp3): plan-vs-actual, the meter fills as time logs ──
  await page.getByTestId('timer-toggle').click();
  await expect(page.getByTestId('timer-toggle')).toHaveText('Start timer');
  await page.getByLabel('Hours').fill('2');
  await holdUntil(ENDS[3]);

  // ── Scene 5 (5.mp3): it turns red when you go over budget ──
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByTestId('time-tracking')).toContainText(/over/i);
  await holdUntil(ENDS[4]);

  // ── Scene 6 (6.mp3): it rolls up into the weekly report ──
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('main').first()).toBeVisible({ timeout: 20_000 });
  await holdUntil(ENDS[5]);
});
