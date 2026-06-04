import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Board optimistic-move test (US4, T048, FR-WEB-030/103, D15). A drag updates the card's column
 * immediately (optimistic), then persists via `POST /work-items/{id}/move`. On a server refusal
 * (`403` role-disallowed / `409` stale) the move **reverts** to the prior column and surfaces a kind,
 * recoverable message; on success the server's authoritative state is reloaded. The api-client is
 * mocked; the exported `useBoard` engine is driven directly (drag is exercised by the e2e).
 */

const { state, api, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  const state = {
    statuses: [
      { id: 's-todo', name: 'To Do', category: 'UNSTARTED', color: '', position: 0 },
      { id: 's-doing', name: 'In Progress', category: 'STARTED', color: '', position: 1 },
    ],
    items: [
      {
        id: 'wi-1',
        key: 'RY-1',
        number: 1,
        projectId: 'p-1',
        title: 'Drag me',
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
        version: 3,
        completedAt: null,
        createdAt: '2026-06-04T00:00:00.000Z',
        updatedAt: '2026-06-04T00:00:00.000Z',
      },
    ] as Array<Record<string, unknown>>,
    moveBehavior: 'ok' as 'ok' | '403' | '409',
  };
  const api = {
    listStatuses: vi.fn(async () => state.statuses),
    listAllWorkItems: vi.fn(async () => state.items.map((i) => ({ ...i }))),
    moveWorkItem: vi.fn(async (id: string, body: { statusId?: string }) => {
      if (state.moveBehavior === '403') throw new ApiError(403, 'forbidden');
      if (state.moveBehavior === '409') throw new ApiError(409, 'stale');
      const item = state.items.find((i) => i.id === id);
      if (item && body.statusId) item.statusId = body.statusId;
      return { ...(item ?? {}) };
    }),
    createWorkItem: vi.fn(),
  };
  return { state, api, ApiError };
});

vi.mock('@/app/(app)/projects/[projectId]/api-client', () => ({ ApiError, ...api }));

import { useBoard } from '@/app/(app)/projects/[projectId]/board/board-client';

function statusOf(
  result: { current: ReturnType<typeof useBoard> },
  id: string,
): string | undefined {
  return result.current.state?.items.find((i) => i.id === id)?.statusId;
}

beforeEach(() => {
  state.items = [
    {
      id: 'wi-1',
      key: 'RY-1',
      number: 1,
      projectId: 'p-1',
      title: 'Drag me',
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
      version: 3,
      completedAt: null,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
    },
  ];
  state.moveBehavior = 'ok';
  api.moveWorkItem.mockClear();
});

describe('useBoard optimistic move', () => {
  it('persists a successful move and reloads the authoritative state', async () => {
    state.moveBehavior = 'ok';
    const { result } = renderHook(() => useBoard('p-1'));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(async () => {
      await result.current.move('wi-1', 's-doing');
    });

    expect(api.moveWorkItem).toHaveBeenCalledWith(
      'wi-1',
      expect.objectContaining({ statusId: 's-doing', version: 3 }),
    );
    expect(statusOf(result, 'wi-1')).toBe('s-doing');
    expect(result.current.error).toBeNull();
  });

  it('reverts a role-disallowed (403) move with a kind message', async () => {
    state.moveBehavior = '403';
    const { result } = renderHook(() => useBoard('p-1'));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(async () => {
      await result.current.move('wi-1', 's-doing');
    });

    // Reverted to the original column, with a kind, recoverable message.
    expect(statusOf(result, 'wi-1')).toBe('s-todo');
    expect(result.current.error).toMatch(/permission|put back/i);
  });

  it('reverts a stale (409) move and offers to refresh', async () => {
    state.moveBehavior = '409';
    const { result } = renderHook(() => useBoard('p-1'));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    await act(async () => {
      await result.current.move('wi-1', 's-doing');
    });

    expect(statusOf(result, 'wi-1')).toBe('s-todo');
    expect(result.current.error).toMatch(/changed elsewhere|refresh|undone/i);
  });
});
