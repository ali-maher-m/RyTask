'use client';

import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { type MappedError, getView, mapApiError } from '@/lib/api';
import { savedViewToViewSpec, viewSpecToWorkItemQuery } from '@/lib/views/view-config';
import { EmptyState } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Saved-view restore (US7, T069, FR-WEB-042). Loads a saved view by id, reconstructs its full
 * `ViewSpec` (filter AST + multi-key sort + grouping + layout), and **redirects** to the owning
 * project's Board/List with the restored config serialized onto the URL — so the existing Board/List
 * surfaces render the exact saved view over the one shared query path (no duplicated render layer).
 *
 * A cross-project saved view (no `projectId`) opens "My Work", the cross-project hub. A `404`/`403`
 * (deleted view, or a personal view owned by someone else / another tenant) maps to a tenant-safe
 * not-found/forbidden state rendering **zero foreign data** (FR-WEB-101, D10).
 */
export function SavedViewClient({ viewId }: { viewId: string }) {
  const router = useRouter();
  const [error, setError] = useState<MappedError | null>(null);

  const restore = useCallback(async () => {
    setError(null);
    try {
      const view = await getView(viewId);
      const spec = savedViewToViewSpec(view);
      const query = viewSpecToWorkItemQuery(spec, view.projectId ?? undefined);

      const params = new URLSearchParams();
      if (query.filter) params.set('filter', query.filter);
      if (query.smart) params.set('smart', query.smart);
      if (query.group) params.set('group', query.group);
      if (query.sort) params.set('sort', query.sort);
      const qs = params.toString();

      // No project → a cross-project view; open the cross-project hub. Otherwise the project's
      // Board or List with the saved filter/group/sort restored on the URL.
      const dest = view.projectId
        ? `/projects/${view.projectId}/${spec.layout}${qs ? `?${qs}` : ''}`
        : `/my-work${qs ? `?${qs}` : ''}`;
      router.replace(dest);
    } catch (e) {
      setError(mapApiError(e));
    }
  }, [viewId, router]);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (error) {
    return (
      <main style={{ padding: 'var(--space-4)' }}>
        <SurfaceFeedback
          error={error}
          onRetry={restore}
          action={
            <Link href="/projects" style={{ color: 'var(--accent)' }}>
              Back to projects
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main style={{ padding: 'var(--space-4)' }}>
      <EmptyState
        title="Opening saved view…"
        description="Restoring its filters, grouping, and sort."
      />
      <SurfaceLoading label="Opening saved view…" />
    </main>
  );
}
