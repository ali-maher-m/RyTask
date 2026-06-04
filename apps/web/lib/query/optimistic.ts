'use client';

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { type MappedError, isConflict, mapApiError } from '../api/errors';

/**
 * Shared optimistic-reconcile helper (US5, T058, FR-WEB-103, D15). The single place the client
 * encodes "optimistic where safe, never a silent divergence": apply the change to local state
 * immediately, send the mutation, and on a server refusal **roll back** to the snapshot with a
 * kind, recoverable message. A `409` (stale `version`) is surfaced as a conflict so the caller can
 * offer a refresh rather than clobber — the server decision always wins (Principle VI).
 *
 * Two shapes are provided:
 *  - {@link runOptimistic} for surfaces that own React state directly (Board/List/item-detail).
 *  - {@link optimisticListMutation} for TanStack Query caches (snapshot → cancel → patch → settle).
 */

export interface OptimisticResult<T> {
  /** The mutation was accepted by the server. */
  ok: boolean;
  /** The server's authoritative value (present only when `ok`). */
  value?: T;
  /** A mapped, plain-language failure (present only when `!ok`). */
  error?: MappedError;
  /** True when the failure was an optimistic-concurrency conflict (offer a refresh). */
  conflict: boolean;
}

export interface RunOptimistic<T> {
  /** Apply the optimistic change to local state (runs before the request). */
  optimistic: () => void;
  /** Revert the optimistic change (runs on any server/transport failure). */
  rollback: () => void;
  /** Perform the server mutation; resolves with the authoritative value. */
  commit: () => Promise<T>;
  /** Reconcile local state with the server's authoritative value on success. */
  onSuccess?: (value: T) => void | Promise<void>;
}

/**
 * Run a mutation optimistically: apply → commit → (success ? reconcile : rollback). Never throws —
 * the outcome (and a kind message on failure) is returned for the caller to render. Mirrors the
 * Board's move engine and the List's inline edit so both reconcile identically.
 */
export async function runOptimistic<T>({
  optimistic,
  rollback,
  commit,
  onSuccess,
}: RunOptimistic<T>): Promise<OptimisticResult<T>> {
  optimistic();
  try {
    const value = await commit();
    await onSuccess?.(value);
    return { ok: true, value, conflict: false };
  } catch (err) {
    rollback();
    return { ok: false, error: mapApiError(err), conflict: isConflict(err) };
  }
}

/**
 * A kind, recoverable message for a refused optimistic action (revert reason). A `409` invites a
 * refresh; a `403` explains the action was put back; anything else is a generic retry message.
 */
export function reconcileMessage(err: unknown): string {
  return mapApiError(err).message;
}

/**
 * TanStack Query optimistic-list mutation options (D15). Wires `onMutate` (cancel in-flight reads,
 * snapshot, patch the cache), `onError` (roll back to the snapshot), and `onSettled` (re-sync with
 * the server) for a list cache keyed by `queryKey`. Use for caches the surface reads via
 * `useQuery`; surfaces that own plain React state use {@link runOptimistic} instead.
 */
export function optimisticListMutation<TItem, TVars>(
  client: QueryClient,
  queryKey: QueryKey,
  patch: (items: TItem[], vars: TVars) => TItem[],
) {
  return {
    onMutate: async (vars: TVars): Promise<{ previous: TItem[] | undefined }> => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<TItem[]>(queryKey);
      if (previous) client.setQueryData<TItem[]>(queryKey, patch(previous, vars));
      return { previous };
    },
    onError: (_err: unknown, _vars: TVars, ctx?: { previous: TItem[] | undefined }) => {
      if (ctx?.previous) client.setQueryData<TItem[]>(queryKey, ctx.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey });
    },
  };
}
