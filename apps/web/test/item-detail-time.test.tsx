import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item-detail time-integration test (US6, T067, activity-and-source.md §1.4/§2.1, FR-FIN-001/002):
 *  - the item-detail activity feed maps the `TIME_*` actions to friendly, plain lines
 *    ("started a timer", "logged 2h 15m", "edited a time entry", …) — not raw enum strings;
 *  - each time entry shows its OWN source ("Timer" / "Manual"), visibly distinct from the item's
 *    M3 capture-source badge ("Slack") — the two provenances are never conflated.
 * The time clients + `authedFetch` are mocked, so this is a pure render test (no network).
 */

const { authedFetch, timeMock } = vi.hoisted(() => {
  const activity = [
    {
      id: 'a-1',
      actorId: 'founder',
      action: 'TIME_STARTED',
      field: null,
      oldValue: null,
      newValue: { startedAt: '2026-06-09T09:00:00.000Z' },
      createdAt: '2026-06-09T09:00:00.000Z',
    },
    {
      id: 'a-2',
      actorId: 'founder',
      action: 'TIME_STOPPED',
      field: null,
      oldValue: null,
      newValue: { durationSeconds: 3600 },
      createdAt: '2026-06-09T10:00:00.000Z',
    },
    {
      id: 'a-3',
      actorId: 'founder',
      action: 'TIME_LOGGED',
      field: null,
      oldValue: null,
      newValue: { durationSeconds: 8100 }, // 2h 15m
      createdAt: '2026-06-09T11:00:00.000Z',
    },
    {
      id: 'a-4',
      actorId: 'founder',
      action: 'TIME_EDITED',
      field: null,
      oldValue: { durationSeconds: 8100 },
      newValue: { durationSeconds: 9000 },
      createdAt: '2026-06-09T11:30:00.000Z',
    },
    {
      id: 'a-5',
      actorId: 'founder',
      action: 'TIME_DELETED',
      field: null,
      oldValue: { durationSeconds: 600 },
      newValue: null,
      createdAt: '2026-06-09T12:00:00.000Z',
    },
  ];
  const fn = vi.fn(async (path: string) => {
    if (path.endsWith('/activity')) {
      return { ok: true, status: 200, json: async () => ({ data: activity }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
  });
  return { authedFetch: fn, timeMock: {} };
});

// A timer entry and a manual entry — their sources must render distinct from the capture badge.
const ENTRIES = [
  {
    id: 't-1',
    workItemId: 'wi-1',
    projectId: 'p-1',
    userId: 'founder',
    startedAt: '2026-06-09T09:00:00.000Z',
    endedAt: '2026-06-09T10:00:00.000Z',
    durationSeconds: 3600,
    note: null,
    billable: false,
    source: 'TIMER' as const,
    classification: 'PLANNED' as const,
    classificationOverridden: false,
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  },
  {
    id: 't-2',
    workItemId: 'wi-1',
    projectId: 'p-1',
    userId: 'founder',
    startedAt: '2026-06-08T09:00:00.000Z',
    endedAt: '2026-06-08T11:15:00.000Z',
    durationSeconds: 8100,
    note: 'after the fact',
    billable: false,
    source: 'MANUAL' as const,
    classification: 'INTERRUPTION' as const,
    classificationOverridden: true,
    createdAt: '2026-06-08T11:15:00.000Z',
    updatedAt: '2026-06-08T11:15:00.000Z',
  },
];

vi.mock('@/lib/api/time', () => ({
  getActiveTimer: vi.fn(async () => null),
  getProjectRollup: vi.fn(async () => [{ workItemId: 'wi-1', loggedSeconds: 11700 }]),
  listTimeLogs: vi.fn(async () => ENTRIES),
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
  createTimeLog: vi.fn(),
  updateTimeLog: vi.fn(),
  deleteTimeLog: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  authedFetch,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  listComments: vi.fn(async () => []),
  listMemberships: vi.fn(async () => []),
  createComment: vi.fn(async () => ({})),
}));
vi.mock('@/lib/org/org-context', () => ({
  useOrg: () => ({ formatDate: (iso: string | null | undefined) => String(iso ?? '') }),
}));

import { ItemDetail } from '@/components/item-detail';

const ITEM = {
  id: 'wi-1',
  key: 'RY-1',
  number: 1,
  projectId: 'p-1',
  title: 'A Slack-captured item',
  description: null,
  statusId: 's-todo',
  priority: 'MEDIUM',
  source: 'SLACK', // the M3 capture source — distinct from a time entry's own source
  assigneeId: null,
  reporterId: null,
  parentId: null,
  estimateValue: 8,
  startDate: null,
  endDate: null,
  dueDate: null,
  position: 1,
  version: 1,
  completedAt: null,
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

beforeEach(() => {
  authedFetch.mockClear();
});

describe('ItemDetail — time woven into the product (US6)', () => {
  it('maps TIME_* activity actions to friendly, plain lines', async () => {
    render(<ItemDetail item={ITEM as never} canEdit={false} />);
    const feed = await screen.findByTestId('activity-feed');
    await waitFor(() => expect(within(feed).getAllByTestId('activity-entry').length).toBe(5));

    const text = feed.textContent ?? '';
    expect(text).toContain('started a timer');
    expect(text).toContain('stopped the timer');
    expect(text).toContain('logged 2h 15m');
    expect(text).toContain('edited a time entry');
    expect(text).toContain('deleted a time entry');
    // The raw enum strings must NOT leak into the feed.
    expect(text).not.toContain('TIME_STARTED');
    expect(text).not.toContain('TIME_LOGGED');
  });

  it("shows each entry's own source distinct from the item's capture-source badge", async () => {
    render(<ItemDetail item={ITEM as never} canEdit={false} />);

    // The item carries its M3 capture source (Slack) in the header.
    const detail = await screen.findByTestId('item-detail');
    expect(within(detail).getByText('Slack')).toBeTruthy();

    // Each time entry shows its OWN source — Timer / Manual — never "Slack".
    await waitFor(() =>
      expect(screen.getAllByTestId('time-entry-source').length).toBe(ENTRIES.length),
    );
    const sources = screen.getAllByTestId('time-entry-source').map((el) => el.textContent);
    expect(sources).toContain('Timer');
    expect(sources).toContain('Manual');
    expect(sources).not.toContain('Slack');
  });
});
