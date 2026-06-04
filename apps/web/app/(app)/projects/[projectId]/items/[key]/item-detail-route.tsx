'use client';

import { ItemDetail } from '@/components/item-detail';
import { ApiError, listAllWorkItems, listLabels, listStatuses } from '@/lib/api';
import type { Label, Status, WorkItem } from '@rytask/contracts';
import { ErrorState, ForbiddenState, NotFoundState } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Client surface for the item-detail route (US3, T046). Resolves the work item by its human key
 * (there is no get-by-key endpoint, so it lists the project's items and matches client-side — M1
 * projects are small), loads the project's statuses + workspace labels, and mounts `ItemDetail`.
 * Tenant-safe: a 403/404 (or a key that isn't in this project) renders a friendly state with **no**
 * foreign data (FR-WEB-101). Deleting routes back to the board.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'error' };

const PAGE: React.CSSProperties = {
  maxWidth: 'var(--container-prose)',
  margin: '0 auto',
  padding: 'var(--space-4)',
};

export function ItemDetailRoute({ projectId, itemKey }: { projectId: string; itemKey: string }) {
  const router = useRouter();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [items, st, lb] = await Promise.all([
        listAllWorkItems({ projectId }),
        listStatuses(projectId),
        listLabels(),
      ]);
      setStatuses(st);
      setLabels(lb);
      const found = items.find((i) => i.key === itemKey) ?? null;
      if (!found) {
        setState({ kind: 'not-found' });
        return;
      }
      setItem(found);
      setState({ kind: 'ready' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setState({ kind: 'forbidden' });
      else if (e instanceof ApiError && e.status === 404) setState({ kind: 'not-found' });
      else setState({ kind: 'error' });
    }
  }, [projectId, itemKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const backToBoard = `/projects/${projectId}/board`;

  if (state.kind === 'loading') {
    return (
      <main style={PAGE}>
        <p>Loading item…</p>
      </main>
    );
  }
  if (state.kind === 'forbidden') {
    return (
      <main style={PAGE}>
        <ForbiddenState />
      </main>
    );
  }
  if (state.kind === 'not-found') {
    return (
      <main style={PAGE}>
        <NotFoundState action={<Link href={backToBoard}>Back to board</Link>} />
      </main>
    );
  }
  if (state.kind === 'error' || !item) {
    return (
      <main style={PAGE}>
        <ErrorState onRetry={load} />
      </main>
    );
  }

  return (
    <main style={PAGE}>
      <p style={{ marginTop: 0 }}>
        <Link href={backToBoard} style={{ color: 'var(--accent)' }}>
          ← Back to board
        </Link>
      </p>
      <ItemDetail
        item={item}
        statuses={statuses}
        labels={labels}
        onChange={setItem}
        onDeleted={() => router.push(backToBoard)}
        onClose={() => router.push(backToBoard)}
      />
    </main>
  );
}
