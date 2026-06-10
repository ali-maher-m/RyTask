import { DropdownMenu, type MenuItemSpec, Select } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for the accessible `<DropdownMenu>` + native `<Select>` (component-contracts §A).
 * Asserts the trigger's `aria-haspopup`/`aria-expanded`, that opening reveals a `role="menu"` of
 * `role="menuitem"`s, that selecting runs `onSelect` + closes, and that Escape closes.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

const renderMenu = (items: MenuItemSpec[]) =>
  render(
    <DropdownMenu
      label="Actions"
      trigger={(p) => (
        <button type="button" {...p}>
          Open
        </button>
      )}
      items={items}
    />,
  );

describe('DropdownMenu', () => {
  it('the trigger advertises a closed menu popup', () => {
    renderMenu([{ id: 'a', label: 'Edit' }]);
    const trigger = screen.getByRole('button', { name: 'Open' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens to a menu of menuitems and selecting runs onSelect + closes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderMenu([
      { id: 'edit', label: 'Edit', onSelect },
      { id: 'del', label: 'Delete', danger: true },
    ]);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const menu = screen.getByRole('menu', { name: 'Actions' });
    expect(menu).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);

    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Escape closes the open menu', async () => {
    const user = userEvent.setup();
    renderMenu([{ id: 'a', label: 'Edit' }]);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Select renders its options as a native combobox', () => {
    render(
      <Select aria-label="Priority" defaultValue="HIGH">
        <option value="HIGH">High</option>
        <option value="LOW">Low</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Priority' }) as HTMLSelectElement;
    expect(select.value).toBe('HIGH');
    expect(screen.getByRole('option', { name: 'Low' })).toBeTruthy();
  });

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup();
    const { container } = renderMenu([{ id: 'a', label: 'Edit' }]);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const results = await axe(container, AXE_OPTS);
    expect(results.violations).toEqual([]);
  });
});
