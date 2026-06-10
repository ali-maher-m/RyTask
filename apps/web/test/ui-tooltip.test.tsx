import { Tooltip } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for `<Tooltip>` (component-contracts §A, FR-WEB-100). It surfaces a "reason" on
 * hover AND keyboard focus, exposing it to assistive tech via `role="tooltip"` +
 * `aria-describedby` — the mechanism the capability map uses to explain a disabled control.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

describe('Tooltip', () => {
  it('is hidden until hover, then describes the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Only an owner can do this">
        <button type="button">Transfer</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();

    await user.hover(screen.getByRole('button', { name: 'Transfer' }));
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Only an owner can do this');

    await user.unhover(screen.getByRole('button', { name: 'Transfer' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('also opens on keyboard focus (works around disabled controls)', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Why this is disabled">
        <button type="button">Focus me</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip').textContent).toBe('Why this is disabled');
  });

  it('has no accessibility violations while shown', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Tooltip content="Helpful reason">
        <button type="button">Hover</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Hover' }));
    const results = await axe(container, AXE_OPTS);
    expect(results.violations).toEqual([]);
  });
});
