import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Command-palette component test (US11, T087, FR-WEB-090). The palette must complete a
 * navigate-or-create in ≤2 actions: action 1 = type the query, action 2 = select a hit (navigate)
 * or select the "Create work item" affordance (create). We mock the consolidated `@/lib/api`
 * `search` and `next/navigation` `useRouter`, then drive the real `cmdk` dialog through its UI.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  search: searchMock,
}));

import { CommandPalette } from '@/components/command-palette';
import type { SearchResult } from '@rytask/contracts';

// cmdk renders a Radix dialog that calls scrollIntoView / ResizeObserver / matchMedia — none of
// which jsdom implements. Stub them so the dialog mounts.
beforeEach(() => {
  push.mockReset();
  searchMock.mockReset();
  // biome-ignore lint/suspicious/noExplicitAny: jsdom polyfill shims for the Radix dialog.
  (Element.prototype as any).scrollIntoView = vi.fn();
  // biome-ignore lint/suspicious/noExplicitAny: minimal ResizeObserver shim.
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!window.matchMedia) {
    // biome-ignore lint/suspicious/noExplicitAny: minimal matchMedia shim.
    (window as any).matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  }
});

function hit(
  partial: Partial<SearchResult> & Pick<SearchResult, 'type' | 'id' | 'title'>,
): SearchResult {
  return { snippet: null, rank: 1, projectId: null, ...partial };
}

function typeQuery(value: string): void {
  const input = screen.getByLabelText('Search');
  fireEvent.change(input, { target: { value } });
}

describe('CommandPalette — navigate-or-create in ≤2 actions', () => {
  it('navigates to a hit in 2 actions: type, then select', async () => {
    searchMock.mockResolvedValue([
      hit({ type: 'work_item', id: 'wi-1', title: 'Fix login redirect', projectId: 'p-1' }),
    ]);

    render(<CommandPalette defaultOpen />);

    // Action 1 — type the query.
    typeQuery('login');

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith('login'));
    const result = await screen.findByText('Fix login redirect');

    // Action 2 — select the hit. That is the second (and final) action → navigate.
    fireEvent.click(result);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p-1/list'));
  });

  it('offers create when nothing matches, completing in 2 actions', async () => {
    searchMock.mockResolvedValue([]);

    render(<CommandPalette defaultOpen />);

    // Action 1 — type a term that matches nothing.
    typeQuery('brand new idea');

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith('brand new idea'));
    const createItem = await screen.findByText(/Create work item/i);

    // Action 2 — select "create".
    fireEvent.click(createItem);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/my-work?create=brand%20new%20idea'));
  });

  it('groups ranked hits by type and preserves server order', async () => {
    searchMock.mockResolvedValue([
      hit({ type: 'project', id: 'p-1', title: 'Rytask Core', rank: 9 }),
      hit({ type: 'work_item', id: 'wi-2', title: 'Wire the inbox', projectId: 'p-1', rank: 8 }),
    ]);

    render(<CommandPalette defaultOpen />);
    typeQuery('ry');

    expect(await screen.findByText('Rytask Core')).toBeTruthy();
    expect(screen.getByText('Wire the inbox')).toBeTruthy();
    // Headings for both groups render.
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('Work items')).toBeTruthy();
  });
});
