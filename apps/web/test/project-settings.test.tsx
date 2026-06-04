import { StatusManager } from '@/components/status-manager';
import type { Status } from '@rytask/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Project settings — status delete re-map test (US6, T059, FR-WEB-051). The server returns `409`
 * when a populated status is deleted without a `reassignTo`, so the UI must require re-mapping
 * first: deleting a status that still has items reveals a "move items to" picker and the delete is
 * blocked until a target status is chosen. An empty status deletes directly. `StatusManager` is
 * presentational (data + callbacks via props), so it is tested without providers.
 */

const STATUSES: Status[] = [
  { id: 's-todo', name: 'To Do', category: 'UNSTARTED', color: '', position: 0 },
  { id: 's-done', name: 'Done', category: 'COMPLETED', color: '', position: 1 },
];

function renderManager(overrides: Partial<React.ComponentProps<typeof StatusManager>> = {}) {
  const onDelete = vi.fn();
  const props: React.ComponentProps<typeof StatusManager> = {
    statuses: STATUSES,
    itemCounts: { 's-todo': 3 }, // To Do is populated; Done is empty
    canEdit: true,
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete,
    onReorder: vi.fn(),
    ...overrides,
  };
  const utils = render(<StatusManager {...props} />);
  return { onDelete, ...utils };
}

describe('StatusManager — delete requires re-mapping a populated status', () => {
  it('blocks deleting a populated status until a target is chosen, then passes reassignTo', () => {
    const { onDelete } = renderManager();

    fireEvent.click(screen.getByRole('button', { name: 'Delete To Do' }));

    // The re-map picker appears; confirming without a target does nothing.
    const confirm = screen.getByTestId('status-delete-confirm');
    expect(within(confirm).getByTestId('reassign-select')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).not.toHaveBeenCalled();

    // Choose a target status to move the items onto, then confirm.
    fireEvent.change(within(confirm).getByTestId('reassign-select'), {
      target: { value: 's-done' },
    });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).toHaveBeenCalledWith('s-todo', 's-done');
  });

  it('deletes an empty status directly (no re-map needed)', () => {
    const { onDelete } = renderManager();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Done' }));
    const confirm = screen.getByTestId('status-delete-confirm');
    // No re-map picker for an empty status.
    expect(within(confirm).queryByTestId('reassign-select')).toBeNull();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).toHaveBeenCalledWith('s-done', null);
  });

  it('hides mutation controls when the role cannot edit', () => {
    renderManager({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'Delete To Do' })).toBeNull();
    expect(screen.queryByLabelText('New status name')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderManager();
    // color-contrast needs canvas/layout that jsdom can't provide; it's covered by the e2e axe scan.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
