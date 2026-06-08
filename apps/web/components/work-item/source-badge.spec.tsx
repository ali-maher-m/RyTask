import type { CaptureSource } from '@rytask/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceBadge } from './source-badge';

/**
 * SourceBadge component test (T099, US7, FR-WEB-112, capture-source.md §3). Asserts each capture
 * source renders with its human-facing **text label** (so provenance is not colour-alone — WCAG),
 * that `MCP` maps to "Agent", and that the badge uses the token-only `info` tone (→ `--info-soft`/
 * `--info-fg`), never a raw colour.
 */
const CASES: Array<{ source: CaptureSource; label: string }> = [
  { source: 'WEB', label: 'Web' },
  { source: 'SLACK', label: 'Slack' },
  { source: 'MCP', label: 'Agent' },
  { source: 'API', label: 'API' },
];

describe('SourceBadge', () => {
  for (const { source, label } of CASES) {
    it(`renders "${label}" for source ${source} as a token-only info badge`, () => {
      const { container, unmount } = render(<SourceBadge source={source} />);
      // Visible text label (not colour-alone) — getByText throws if it is absent.
      const el = screen.getByText(label);
      expect(el.textContent).toBe(label);
      // Token-only styling: the @rytask/ui Badge `info` tone (→ --info-soft/--info-fg). CSS Modules
      // resolve to non-scoped class names in Vitest, so the rendered span carries the `info` class.
      const badge = container.querySelector('span');
      expect(badge?.className).toContain('info');
      unmount();
    });
  }
});
