import type { CSSProperties, ReactNode } from 'react';

type Status = 'available' | 'in-progress' | 'coming-soon';

const LABELS: Record<Status, string> = {
  available: 'Available',
  'in-progress': 'In progress',
  'coming-soon': 'Coming soon',
};

/** Semantic-token colors only (brand rule): no raw values, dark ink on yellow. */
const STYLES: Record<Status, CSSProperties> = {
  available: {
    background: 'var(--success-soft)',
    color: 'var(--success-fg)',
    borderColor: 'var(--success)',
  },
  'in-progress': {
    background: 'var(--accent-soft)',
    color: 'var(--accent-fg)',
    borderColor: 'var(--accent)',
  },
  'coming-soon': {
    background: 'var(--surface-sunken)',
    color: 'var(--fg-muted)',
    borderColor: 'var(--border-strong)',
  },
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  return (
    <span
      style={{
        ...STYLES[status],
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 'var(--radius-pill)',
        padding: 'var(--space-0_5) var(--space-2)',
        fontSize: 'var(--fs-micro)',
        fontWeight: 'var(--w-semibold)' as CSSProperties['fontWeight'],
        letterSpacing: 'var(--track-micro)',
        textTransform: 'uppercase',
        verticalAlign: 'middle',
      }}
    >
      {children ?? LABELS[status]}
    </span>
  );
}

/** A prominent banner for pages describing planned (not yet shipped) features. */
export function ComingSoon({ tier }: { tier?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3) var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <StatusBadge status="coming-soon" />
      <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
        This feature is on the roadmap{tier ? ` (${tier})` : ''} and is not in RyTask yet. This page
        describes what is planned — nothing here is final.
      </span>
    </div>
  );
}

/** A banner for features that exist in a development branch but have not shipped. */
export function InProgress({ note }: { note?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        background: 'var(--accent-soft)',
        border: '1px solid var(--primary-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-3) var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <StatusBadge status="in-progress" />
      <span style={{ color: 'var(--fg-2)', fontSize: 'var(--fs-sm)' }}>
        {note ??
          'This feature is being built right now and lands in the next release. Behavior described here comes from the feature specification.'}
      </span>
    </div>
  );
}
