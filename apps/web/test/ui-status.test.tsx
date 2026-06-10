import { Avatar, StatusDot } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for `<StatusDot>` + `<Avatar>` (component-contracts §A). The dot maps a workflow
 * category to its `--status-*` token (filled vs hollow ring); the avatar shows an image with alt
 * text or falls back to deterministic initials on a token-tinted background.
 */
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } };

describe('StatusDot / Avatar', () => {
  it('StatusDot fills with its category token', () => {
    const { container } = render(<StatusDot category="progress" />);
    const dot = container.querySelector('.dot') as HTMLElement | null;
    expect(dot?.style.background).toContain('--status-progress');
    expect(dot?.className).not.toContain('dotRing');
  });

  it('StatusDot ring uses the color (not the fill)', () => {
    const { container } = render(<StatusDot category="todo" ring />);
    const dot = container.querySelector('.dot') as HTMLElement | null;
    expect(dot?.className).toContain('dotRing');
    expect(dot?.style.color).toContain('--status-todo');
  });

  it('Avatar renders the image with alt text when a src is given', () => {
    render(<Avatar name="Ada Lovelace" src="https://img/ada.png" />);
    const img = screen.getByRole('img', { name: 'Ada Lovelace' }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://img/ada.png');
  });

  it('Avatar falls back to initials with no src', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Avatar name="Grace Hopper" src="https://img/grace.png" />);
    const results = await axe(container, AXE_OPTS);
    expect(results.violations).toEqual([]);
  });
});
