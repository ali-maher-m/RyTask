import type { ReportOverview, WeeklySummary } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';
import { digest, formatHm, narrative } from './report-text';

/**
 * Unit tests for the plain-language narrative (US1, web-surfaces §2/§4). Deterministic DTO → string:
 * range, total, interruption share/hours/item count, planned hours — sentence-case, jargon-free
 * (the Albert/Marissa test), with pluralization, a zero-state, and percentages that always sum to 100.
 */
const overview = (
  loggedSeconds: number,
  plannedSeconds: number,
  interruptionSeconds: number,
  range = { from: '2026-06-01', to: '2026-06-14' },
): ReportOverview => ({
  range,
  totals: { loggedSeconds, plannedSeconds, interruptionSeconds },
  weeks: [],
  topItems: [],
});

describe('formatHm', () => {
  it('formats whole seconds as friendly h/m (never decimal hours)', () => {
    expect(formatHm(0)).toBe('0m');
    expect(formatHm(1800)).toBe('30m');
    expect(formatHm(3600)).toBe('1h');
    expect(formatHm(8100)).toBe('2h 15m');
  });
});

describe('narrative', () => {
  it('gives a friendly zero-state when nothing was tracked', () => {
    const s = narrative(overview(0, 0, 0));
    expect(s).toBe('No time was tracked between Jun 1 and Jun 14 yet.');
  });

  it('says all-planned when there were no interruptions', () => {
    const s = narrative(overview(13200, 13200, 0));
    expect(s).toBe('Between Jun 1 and Jun 14, you tracked 3h 40m — all of it planned work.');
  });

  it('splits interruptions vs planned with percentages that sum to 100', () => {
    // 30m interruption of 3h 40m total = 14% (rounded) → planned shows 86%.
    const s = narrative(overview(13200, 11400, 1800));
    expect(s).toContain('Interruptions took 30m (14%)');
    expect(s).toContain('leaving 3h 10m (86%) for planned work');
  });

  it('includes a singular item count when one interruption item is supplied', () => {
    const s = narrative(overview(13200, 11400, 1800), 1);
    expect(s).toContain('across 1 item,');
  });

  it('pluralizes the item count for multiple interruption items', () => {
    const s = narrative(overview(13200, 11400, 1800), 3);
    expect(s).toContain('across 3 items,');
  });

  it('omits the item-count clause when no count is supplied', () => {
    const s = narrative(overview(13200, 11400, 1800));
    expect(s).not.toContain('across');
  });
});

const weekly = (over: Partial<WeeklySummary> = {}): WeeklySummary => ({
  weekStart: '2026-05-18',
  weekEnd: '2026-05-24',
  userId: 'u-1',
  totals: { loggedSeconds: 149400, plannedSeconds: 56160, interruptionSeconds: 93240 },
  items: [
    {
      workItemId: 'a',
      projectId: 'p',
      key: 'OPS-214',
      title: 'Checkout outage',
      loggedSeconds: 22320,
      estimateValue: null,
      completed: true,
    },
    {
      workItemId: 'b',
      projectId: 'p',
      key: 'WEB-87',
      title: 'Pricing page copy',
      loggedSeconds: 14700,
      estimateValue: '4',
      completed: false,
    },
  ],
  completedItems: [
    {
      workItemId: 'a',
      projectId: 'p',
      key: 'OPS-214',
      title: 'Checkout outage',
      completedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      workItemId: 'c',
      projectId: 'p',
      key: 'WEB-87',
      title: 'Pricing page copy',
      completedAt: '2026-05-21T00:00:00.000Z',
    },
  ],
  ...over,
});

describe('digest', () => {
  it('produces the paste-ready Slack/standup format', () => {
    expect(digest(weekly())).toBe(
      [
        'Week of May 18–24 — 41h 30m tracked',
        'Planned 15h 36m (38%) · Interruptions 25h 54m (62%)',
        'Completed: OPS-214 Checkout outage, WEB-87 Pricing page copy',
        'Top items: OPS-214 6h 12m · WEB-87 4h 5m',
      ].join('\n'),
    );
  });

  it('omits the completed + top lines when there is nothing tracked or done', () => {
    const s = digest(
      weekly({
        totals: { loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
        items: [],
        completedItems: [],
      }),
    );
    expect(s).toBe(
      ['Week of May 18–24 — 0m tracked', 'Planned 0m (0%) · Interruptions 0m (0%)'].join('\n'),
    );
  });

  it('spans months in the week label when the week crosses a month boundary', () => {
    const s = digest(weekly({ weekStart: '2026-05-25', weekEnd: '2026-05-31' }));
    expect(s.split('\n')[0]).toBe('Week of May 25–31 — 41h 30m tracked');
    const cross = digest(weekly({ weekStart: '2026-06-29', weekEnd: '2026-07-05' }));
    expect(cross.split('\n')[0]).toBe('Week of Jun 29–Jul 5 — 41h 30m tracked');
  });
});
