import { Badge, Chip } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for `<Badge>` / `<Chip>` (component-contracts §A). Asserts the tone class, the
 * chip's optional leading dot + keyboard-operable remove button, and that removing fires the
 * caller's handler with an accessible label.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

describe('Badge / Chip', () => {
  it('Badge maps its tone to the semantic state class', () => {
    const { container } = render(<Badge tone="success">Done</Badge>);
    const badge = container.querySelector('.badge');
    expect(badge?.className).toContain('success');
    expect(badge?.textContent).toBe('Done');
  });

  it('Chip renders a leading dot from the passed token color', () => {
    const { container } = render(<Chip dotColor="var(--label-blue)">Bug</Chip>);
    const dot = container.querySelector('.chipDot') as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot?.style.background).toContain('--label-blue');
  });

  it('Chip remove button is labelled and fires onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip onRemove={onRemove} removeLabel="Remove bug label">
        Bug
      </Chip>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove bug label' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a chip with no onRemove renders no button', () => {
    render(<Chip>Plain</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Chip onRemove={() => undefined} removeLabel="Remove">
        Label
      </Chip>,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
