import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Notification inbox component test (US10, T083, FR-WEB-082). Marking a row read, snoozing it, or
 * archiving it must (a) call `PATCH /notifications/{id}` with the right body, (b) drop the row from a
 * filtered state it no longer matches (e.g. `unread`), and (c) keep the unread badge in step. The
 * consolidated `@/lib/api` and the org context are mocked; the inbox is driven through its real UI.
 */

const { api, store } = vi.hoisted(() => {
  interface Notif {
    id: string;
    recipientId: string;
    type: string;
    entityType: string;
    entityId: string;
    actorId: string | null;
    payload: Record<string, unknown>;
    readAt: string | null;
    snoozedUntil: string | null;
    archivedAt: string | null;
    createdAt: string;
  }
  const NOW = '2026-06-04T00:00:00.000Z';
  const store = { items: [] as Notif[] };
  const isUnread = (n: Notif) =>
    n.readAt === null && n.archivedAt === null && n.snoozedUntil === null;
  function filtered(state: string): Notif[] {
    switch (state) {
      case 'unread':
        return store.items.filter(isUnread);
      case 'snoozed':
        return store.items.filter((n) => n.snoozedUntil !== null && n.archivedAt === null);
      case 'archived':
        return store.items.filter((n) => n.archivedAt !== null);
      default:
        return store.items.filter((n) => n.archivedAt === null);
    }
  }
  const api = {
    listNotifications: vi.fn(async (state = 'unread') => ({
      data: filtered(state).map((n) => ({ ...n })),
      pageInfo: { nextCursor: null, hasNextPage: false },
    })),
    getUnreadCount: vi.fn(async () => store.items.filter(isUnread).length),
    updateNotification: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const n = store.items.find((x) => x.id === id);
      if (!n) throw new Error('not found');
      if (patch.read === true) n.readAt = NOW;
      if (patch.read === false) n.readAt = null;
      if ('snoozedUntil' in patch) n.snoozedUntil = patch.snoozedUntil as string | null;
      if (patch.archived === true) n.archivedAt = NOW;
      return { ...n };
    }),
  };
  return { api, store };
});

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  ...api,
}));
vi.mock('@/lib/org/org-context', () => ({
  useOrg: () => ({ formatDate: (iso: string | null | undefined) => String(iso ?? '') }),
}));

import { InboxClient } from '@/app/(app)/inbox/inbox-client';

beforeEach(() => {
  store.items = [
    {
      id: 'n-1',
      recipientId: 'me',
      type: 'MENTIONED',
      entityType: 'work_item',
      entityId: 'wi-1',
      actorId: 'u-2',
      payload: { title: 'You were mentioned in RY-1' },
      readAt: null,
      snoozedUntil: null,
      archivedAt: null,
      createdAt: '2026-06-04T00:00:00.000Z',
    },
    {
      id: 'n-2',
      recipientId: 'me',
      type: 'ASSIGNED',
      entityType: 'work_item',
      entityId: 'wi-2',
      actorId: 'u-2',
      payload: { title: 'RY-2 was assigned to you' },
      readAt: null,
      snoozedUntil: null,
      archivedAt: null,
      createdAt: '2026-06-04T00:00:00.000Z',
    },
  ];
  api.updateNotification.mockClear();
  api.getUnreadCount.mockClear();
  api.listNotifications.mockClear();
});

function rows(): HTMLElement[] {
  return within(screen.getByTestId('inbox-list')).getAllByTestId('inbox-row');
}

function firstRow(): HTMLElement {
  const [row] = rows();
  if (!row) throw new Error('expected at least one inbox row');
  return row;
}

describe('InboxClient — read/snooze/archive update the unread count', () => {
  it('marks a row read: it leaves the unread list and the badge decrements', async () => {
    render(<InboxClient />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByTestId('unread-badge').textContent).toContain('2');

    fireEvent.click(
      within(firstRow()).getByRole('button', { name: /mark notification .* as read/i }),
    );

    await waitFor(() => expect(api.updateNotification).toHaveBeenCalledWith('n-1', { read: true }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId('unread-badge').textContent).toContain('1');
  });

  it('snoozes a row: it leaves the unread list and the badge decrements', async () => {
    render(<InboxClient />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(within(firstRow()).getByRole('button', { name: /snooze notification/i }));

    await waitFor(() => {
      const call = api.updateNotification.mock.calls.find(([id]) => id === 'n-1');
      expect(call?.[1]).toHaveProperty('snoozedUntil');
    });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId('unread-badge').textContent).toContain('1');
  });

  it('archives a row: it leaves the unread list and the badge decrements', async () => {
    render(<InboxClient />);
    await waitFor(() => expect(rows()).toHaveLength(2));

    fireEvent.click(within(firstRow()).getByRole('button', { name: /archive notification/i }));

    await waitFor(() =>
      expect(api.updateNotification).toHaveBeenCalledWith('n-1', { archived: true }),
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId('unread-badge').textContent).toContain('1');
  });
});
