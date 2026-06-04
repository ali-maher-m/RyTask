'use client';

import { ApiError, restoreWorkItem } from '@/lib/api';
import { type TrashedItem, listTrashed, removeTrashed } from '@/lib/work-items/trash-registry';
import { EmptyState } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * Trash client (US3, T047, FR-WEB-023). The M1 API soft-deletes items and can restore them, but
 * does not enumerate trashed items (no new server capability), so this lists what *this client*
 * trashed (the localStorage registry) and offers Restore. A successful restore calls
 * `POST /work-items/{id}/restore` and drops the entry; the item returns to its active views with
 * comments + history intact. Token-only, keyboard-accessible.
 */

const PAGE: React.CSSProperties = {
  maxWidth: 'var(--container-page)',
  margin: '0 auto',
  padding: 'var(--space-4)',
};

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-3)',
};

const BUTTON: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg-on-accent)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  cursor: 'pointer',
};

export function TrashClient({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<TrashedItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(listTrashed(projectId));
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function restore(item: TrashedItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await restoreWorkItem(item.id);
      removeTrashed(item.id);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Restore failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main style={PAGE}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Trash</h1>
        <nav>
          <Link href={`/projects/${projectId}/board`} style={{ color: 'var(--accent)' }}>
            Back to board
          </Link>
        </nav>
      </header>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Trash is empty"
          description="Items you move to trash from this device appear here so you can restore them."
        />
      ) : (
        <ul
          aria-label="Trashed items"
          data-testid="trash-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {items.map((item) => (
            <li key={item.id} data-testid="trash-row" style={ROW}>
              <span>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                  {item.key}
                </code>{' '}
                {item.title}
              </span>
              <button
                type="button"
                onClick={() => restore(item)}
                disabled={busyId === item.id}
                aria-label={`Restore ${item.key}`}
                style={BUTTON}
              >
                {busyId === item.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
