'use client';

import type { WorkItem } from '@rytask/contracts';

/**
 * Client-side trash registry (US3, T047, FR-WEB-023). The M1 API soft-deletes a work item
 * (`DELETE /work-items/{id}` sets `deleted_at`) and can restore it (`POST /work-items/{id}/restore`),
 * but — by design — the list endpoint default-excludes trashed items and there is **no** server route
 * to enumerate them (this feature adds no server capability). So the web surface remembers what *this
 * client* trashed in `localStorage` and offers Restore from the project's Trash page. Restoring an
 * item the server already brought back is a harmless no-op; the registry only ever drives the Restore
 * affordance, never authorization or tenant scoping (the server stays authoritative).
 */

export interface TrashedItem {
  id: string;
  key: string;
  title: string;
  projectId: string;
  /** When this client trashed it (ISO, for ordering/display only). */
  trashedAt: string;
}

const STORAGE_KEY = 'rytask.trash';

function readAll(): TrashedItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrashedItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: TrashedItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full / unavailable — the Trash page simply won't list this item; not fatal.
  }
}

/** Record a just-trashed item so the project's Trash page can offer to restore it. */
export function recordTrashed(item: Pick<WorkItem, 'id' | 'key' | 'title' | 'projectId'>): void {
  const entry: TrashedItem = {
    id: item.id,
    key: item.key,
    title: item.title,
    projectId: item.projectId,
    trashedAt: new Date().toISOString(),
  };
  const next = readAll().filter((t) => t.id !== entry.id);
  next.push(entry);
  writeAll(next);
}

/** The items this client trashed in a project, most-recent first. */
export function listTrashed(projectId: string): TrashedItem[] {
  return readAll()
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => (a.trashedAt < b.trashedAt ? 1 : -1));
}

/** Drop an item from the registry (after a successful restore, or when it's no longer relevant). */
export function removeTrashed(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}
