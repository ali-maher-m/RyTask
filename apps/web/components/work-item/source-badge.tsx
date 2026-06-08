import type { CaptureSource } from '@rytask/contracts';
import { Badge } from '@rytask/ui';

/**
 * Capture-source badge (US7, FR-WEB-112, capture-source.md §3, research D17). A token-only
 * `@rytask/ui` `Badge` (the `info` tone resolves to `var(--info-soft)`/`var(--info-fg)`) carrying a
 * **text label** — so provenance is never conveyed by colour alone (WCAG). The stored `MCP` source
 * shows the human-facing label "Agent"; the others are 1:1. Rendered on the item (detail + list)
 * and inside the `CREATED` activity entry, so cross-channel capture is trustworthy and auditable.
 */
const SOURCE_LABELS: Record<CaptureSource, string> = {
  WEB: 'Web',
  SLACK: 'Slack',
  MCP: 'Agent',
  API: 'API',
};

export function SourceBadge({ source }: { source: CaptureSource }) {
  return <Badge tone="info">{SOURCE_LABELS[source]}</Badge>;
}
