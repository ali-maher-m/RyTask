import { Meter } from '@rytask/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for the signature `<Meter>` (T032, web-surfaces.md §1/§8). Asserts the three states
 * — under budget (honey fill + planned tick), over budget (red fill + amount over), and no estimate
 * (no tick, no over-budget judgement) — plus that durations render through `<Figure>` (tabular-nums).
 * CSS modules resolve to non-scoped class names here, so the state classes are queryable directly.
 */
describe('Meter', () => {
  it('under budget: fills toward the planned tick, no over-budget state', () => {
    const { container } = render(
      <Meter loggedSeconds={7200} estimateSeconds={28800} size="detail" showFigures />,
    );
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('7200');
    expect(meter.getAttribute('aria-valuemax')).toBe('28800');
    expect(meter.querySelector('.over')).toBeNull();
    expect(meter.querySelector('.tick')).not.toBeNull(); // the planned tick is present
    expect(container.textContent).toContain('2h'); // logged
    expect(container.textContent).toContain('8h'); // estimate
    // Durations render through <Figure> (Geist-Mono tabular-nums).
    expect(container.querySelector('.figure')).not.toBeNull();
  });

  it('over budget: the fill turns red and the amount over is shown', () => {
    render(<Meter loggedSeconds={10800} estimateSeconds={7200} size="row" showFigures />);
    const meter = screen.getByRole('meter');
    expect(meter.querySelector('.over')).not.toBeNull();
    expect(meter.getAttribute('aria-valuemax')).toBe('7200');
    expect(screen.getByText(/over/i)).toBeTruthy(); // 10800 − 7200 = 1h over
  });

  it('no estimate: no planned tick, never an over-budget state (no false judgement)', () => {
    render(<Meter loggedSeconds={5400} estimateSeconds={null} showFigures />);
    const meter = screen.getByRole('meter');
    expect(meter.querySelector('.tick')).toBeNull();
    expect(meter.querySelector('.over')).toBeNull();
    const label = meter.getAttribute('aria-label') ?? '';
    expect(label).toContain('logged');
    expect(label).not.toContain('of'); // no "X of Y estimated" judgement
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <Meter loggedSeconds={3600} estimateSeconds={7200} size="detail" showFigures />,
    );
    // color-contrast needs canvas/layout jsdom can't provide; it's covered by the e2e axe scan.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
