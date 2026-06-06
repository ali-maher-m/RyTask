import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Sub-task tree component test (US8, T071, FR-WEB-060). A node renders its direct child count, and a
 * self / cyclic-parent attempt is rejected by the tree's single guard (`wouldCreateCycle`) so the UI
 * can never render — or persist — a parent loop. `authedFetch` is mocked (children load lazily on
 * expand; the count comes from the server's `childCount`, so no network is needed for the count case).
 */

const { authedFetch } = vi.hoisted(() => ({
  authedFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  })),
}));

vi.mock('@/lib/api', () => ({ authedFetch }));
// The tree reads the org-tz overdue helper from OrgContext; stub it so the node renders without a
// full provider tree (these cases use no due date, so the flag is always false anyway).
vi.mock('@/lib/org/org-context', () => ({ useOrg: () => ({ isOverdue: () => false }) }));

import { SubtaskTree, wouldCreateCycle } from '@/components/subtask-tree';

const ROOT = {
  id: 'wi-root',
  key: 'RY-1',
  number: 1,
  projectId: 'p-1',
  title: 'Epic: ship the tree',
  description: null,
  statusId: 's-todo',
  priority: 'NONE',
  assigneeId: null,
  reporterId: null,
  parentId: null,
  childCount: 3,
  estimateValue: null,
  startDate: null,
  endDate: null,
  dueDate: null,
  overdue: false,
  position: 1,
  version: 1,
  completedAt: null,
  createdAt: '2026-06-04T00:00:00.000Z',
  updatedAt: '2026-06-04T00:00:00.000Z',
};

describe('SubtaskTree', () => {
  it('renders the root node with its direct child count', () => {
    render(<SubtaskTree root={ROOT as never} statuses={[]} />);
    expect(screen.getByTestId('subtask-tree')).toBeTruthy();
    const node = screen.getByTestId('subtask-node');
    expect(node.textContent).toMatch(/3 sub-tasks/);
    expect(node.textContent).toMatch(/RY-1/);
  });

  it('singularizes the count for a node with one child', () => {
    render(<SubtaskTree root={{ ...ROOT, childCount: 1 } as never} statuses={[]} />);
    expect(screen.getByTestId('subtask-node').textContent).toMatch(/1 sub-task(?!s)/);
  });
});

describe('wouldCreateCycle (cyclic-parent guard, FR-WEB-060)', () => {
  it('rejects making an item its own parent', () => {
    expect(wouldCreateCycle('wi-1', 'wi-1', [])).toBe(true);
  });

  it('rejects a parent that is already an ancestor/descendant', () => {
    expect(wouldCreateCycle('wi-child', 'wi-ancestor', ['wi-ancestor', 'wi-root'])).toBe(true);
  });

  it('allows an unrelated parent', () => {
    expect(wouldCreateCycle('wi-child', 'wi-elsewhere', ['wi-ancestor', 'wi-root'])).toBe(false);
  });
});
