'use client';

import type { MappedError } from '@/lib/api';
import { ErrorState, ForbiddenState, NotFoundState, Skeleton } from '@rytask/ui';
import type { ReactNode } from 'react';

/**
 * Shared data-surface feedback (US5, T056/T057, FR-WEB-101/102, D10). One place that turns a
 * `mapApiError` result into the right tenant-safe SurfaceState — a `403`→forbidden, a `404`→
 * not-found (existence is never leaked across tenants), a conflict/other→error-with-retry. Every
 * data surface (Board, List, My Work, item-detail, project pages) renders **zero foreign data** on
 * a cross-tenant deep link by routing its load failure through here.
 */
export function SurfaceFeedback({
  error,
  onRetry,
  action,
}: {
  error: MappedError;
  onRetry?: () => void;
  /** A recovery affordance (e.g. "Back to projects") for the forbidden/not-found states. */
  action?: ReactNode;
}) {
  switch (error.kind) {
    case 'forbidden':
      return <ForbiddenState action={action} />;
    case 'not-found':
      return <NotFoundState action={action} />;
    default:
      return <ErrorState description={error.message} onRetry={onRetry} />;
  }
}

/** A simple stacked-rows loading placeholder for a list/board while the first read is in flight. */
export function SurfaceLoading({
  rows = 5,
  label = 'Loading…',
}: { rows?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 'var(--space-2)' }}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders, never reordered
        <Skeleton key={`row-${i}`} height="2.25rem" />
      ))}
    </div>
  );
}
