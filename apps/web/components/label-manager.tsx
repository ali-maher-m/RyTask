'use client';

import type { CreateLabel, Label } from '@rytask/contracts';
import { Button, Chip } from '@rytask/ui';
import { useState } from 'react';

/**
 * Workspace labels manager (US6, T063, FR-WEB-052). Labels are workspace-scoped, appliable to any
 * item (item-detail) and filterable (filter bar). The M1 server supports create + list only (no
 * edit/delete) — this feature adds **no new server capability** — so the manager creates and lists
 * labels and notes that rename/remove isn't available. Presentational: data + the create call come
 * from props, so it is testable without providers. Token-only.
 */

export interface LabelManagerProps {
  labels: Label[];
  busy?: boolean;
  canEdit: boolean;
  onCreate: (input: CreateLabel) => void | Promise<void>;
}

export function LabelManager({ labels, busy = false, canEdit, onCreate }: LabelManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('');

  function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const input: CreateLabel = { name: trimmed };
    if (color.trim()) input.color = color.trim();
    void onCreate(input);
    setName('');
    setColor('');
  }

  return (
    <section aria-labelledby="labels-heading">
      <h2 id="labels-heading" style={{ fontSize: 'var(--fs-h2)' }}>
        Labels
      </h2>
      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
        Workspace-wide tags you can apply to items and filter by.
      </p>

      {labels.length === 0 ? (
        <p
          data-testid="labels-empty"
          style={{ color: 'var(--fg-faint)', fontSize: 'var(--fs-sm)' }}
        >
          No labels yet.
        </p>
      ) : (
        <ul
          data-testid="label-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          {labels.map((label) => (
            <li key={label.id}>
              <Chip dotColor={label.color || undefined}>{label.name}</Chip>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form
          onSubmit={add}
          aria-label="Add label"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
          }}
        >
          <div style={{ flex: 1 }}>
            <label htmlFor="new-label-name" style={LABEL}>
              New label name
            </label>
            <input
              id="new-label-name"
              type="text"
              value={name}
              maxLength={60}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              style={{ ...CONTROL, width: '100%' }}
            />
          </div>
          <div>
            <label htmlFor="new-label-color" style={LABEL}>
              Color
            </label>
            <input
              id="new-label-color"
              type="text"
              value={color}
              placeholder="#RRGGBB"
              disabled={busy}
              onChange={(e) => setColor(e.target.value)}
              style={{ ...CONTROL, width: '7rem', fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
            Add label
          </Button>
        </form>
      ) : null}
    </section>
  );
}

const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};
