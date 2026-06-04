import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item-detail component test (US3, T043, FR-WEB-022/023). A field edit PATCHes with the optimistic
 * `version`, the returned (bumped) item replaces local state so the change persists in the surface,
 * and the per-item activity feed gains an entry describing the change (field, old→new, actor, time).
 * `authedFetch` is mocked: the activity GET returns the new entry after the PATCH; no network.
 */

const { authedFetch, mock } = vi.hoisted(() => {
  const BASE = {
    id: 'wi-1',
    key: 'RY-1',
    number: 1,
    projectId: 'p-1',
    title: 'Wire the detail panel',
    description: null as string | null,
    statusId: 's-todo',
    priority: 'NONE',
    assigneeId: null as string | null,
    reporterId: null as string | null,
    parentId: null as string | null,
    estimateValue: null as number | null,
    startDate: null as string | null,
    endDate: null as string | null,
    dueDate: null as string | null,
    position: 1,
    version: 1,
    completedAt: null as string | null,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
  };
  const state = {
    item: { ...BASE },
    activity: [] as Array<Record<string, unknown>>,
  };
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/activity')) {
      return { ok: true, status: 200, json: async () => ({ data: state.activity }) } as Response;
    }
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const changedField = Object.keys(body).find((k) => k !== 'version') ?? 'field';
      const oldValue = (state.item as Record<string, unknown>)[changedField] ?? null;
      const newValue = body[changedField];
      state.item = { ...state.item, ...body, version: Number(state.item.version) + 1 };
      state.activity = [
        {
          id: 'a-1',
          actorId: 'founder',
          action: 'changed',
          field: changedField,
          oldValue,
          newValue,
          createdAt: '2026-06-04T01:00:00.000Z',
        },
      ];
      return { ok: true, status: 200, json: async () => ({ data: state.item }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  return { authedFetch: fn, mock: state };
});

vi.mock('@/lib/api', () => ({ authedFetch }));

import { ItemDetail } from '@/components/item-detail';

const STATUSES = [
  { id: 's-todo', name: 'To Do', category: 'UNSTARTED' as const, color: '', position: 0 },
  { id: 's-doing', name: 'In Progress', category: 'STARTED' as const, color: '', position: 1 },
];

beforeEach(() => {
  authedFetch.mockClear();
  mock.item = {
    id: 'wi-1',
    key: 'RY-1',
    number: 1,
    projectId: 'p-1',
    title: 'Wire the detail panel',
    description: null,
    statusId: 's-todo',
    priority: 'NONE',
    assigneeId: null,
    reporterId: null,
    parentId: null,
    estimateValue: null,
    startDate: null,
    endDate: null,
    dueDate: null,
    position: 1,
    version: 1,
    completedAt: null,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
  };
  mock.activity = [];
});

describe('ItemDetail', () => {
  it('renders the item key, title, and editable fields', async () => {
    render(<ItemDetail item={mock.item as never} statuses={STATUSES as never} />);
    expect(screen.getByRole('heading', { name: 'Wire the detail panel' })).toBeTruthy();
    expect(screen.getByTestId('item-key').textContent).toBe('RY-1');
    expect(screen.getByLabelText('Priority')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByLabelText('Parent')).toBeTruthy();
    await waitFor(() => expect(authedFetch).toHaveBeenCalled());
  });

  it('persists a field change (PATCH with version) and appends an activity entry', async () => {
    render(<ItemDetail item={mock.item as never} statuses={STATUSES as never} />);

    // Initially no activity.
    await waitFor(() =>
      expect(screen.getByTestId('activity-feed').textContent).toMatch(/no activity/i),
    );

    // Change priority None → Urgent.
    const priority = screen.getByLabelText('Priority') as HTMLSelectElement;
    fireEvent.change(priority, { target: { value: 'URGENT' } });

    // The PATCH carried the optimistic version, and the change persists in the control.
    await waitFor(() => {
      const patchCall = authedFetch.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String((patchCall?.[1] as RequestInit).body));
      expect(body.version).toBe(1);
      expect(body.priority).toBe('URGENT');
    });
    await waitFor(() => expect((priority as HTMLSelectElement).value).toBe('URGENT'));

    // The activity feed gains an entry describing the change (field + old→new).
    await waitFor(() => {
      const entry = screen.getByTestId('activity-entry');
      expect(entry.textContent).toMatch(/priority/i);
      expect(entry.textContent).toMatch(/URGENT/);
      expect(entry.textContent).toMatch(/founder/);
    });
  });

  it('surfaces a kind conflict message on a 409 instead of clobbering', async () => {
    authedFetch.mockImplementationOnce(async (path: string) => {
      // First call is the activity GET on mount.
      return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
    });
    authedFetch.mockImplementationOnce(async () => {
      return { ok: false, status: 409, json: async () => ({}) } as Response;
    });
    render(<ItemDetail item={mock.item as never} statuses={STATUSES as never} />);
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'HIGH' } });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/changed elsewhere/i),
    );
  });
});
