import { Dialog } from '@rytask/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for the accessible `<Dialog>` (component-contracts §A). Asserts it renders
 * nothing while closed, exposes `role="dialog"` + `aria-modal` + a labelled title when open, and
 * closes via Escape, the scrim, and the close button.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={() => undefined} title="Settings">
        body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open → a modal dialog labelled by its title', () => {
    render(
      <Dialog open onClose={() => undefined} title="Settings">
        body
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('Escape closes', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Settings">
        body
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Settings">
        body
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a scrim click closes', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog open onClose={onClose} title="Settings">
        body
      </Dialog>,
    );
    const overlay = container.querySelector('.overlay');
    if (!overlay) {
      throw new Error('expected the dialog overlay');
    }
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Dialog open onClose={() => undefined} title="Settings">
        <p>Tune your workspace.</p>
      </Dialog>,
    );
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations();
  });
});
