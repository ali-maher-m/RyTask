import type { Paged } from '@rytask/contracts';

/**
 * MCP list/search pagination helpers (M3, FR-MCP-005, research D14). Wrap the existing keyset
 * services into the `{ items, nextCursor }` envelope with an OPAQUE cursor and optional `fields`
 * projection so a list stays within an agent's token budget. Results are paged, never silently
 * truncated. No `@rytask/db` access here — this is pure transport-shaping over service output.
 */

/** Encode a keyset position into an opaque cursor (base64url JSON). */
export function encodeCursor(position: unknown): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

/** Decode an opaque cursor; returns null for an absent/garbled cursor (caller starts from the top). */
export function decodeCursor<T = unknown>(cursor: string | undefined): T | null {
  if (!cursor) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Trim an item down to the requested fields (token-budget projection); identity when none given. */
export function projectFields<T extends Record<string, unknown>>(
  item: T,
  fields?: string[],
): Partial<T> {
  if (!fields || fields.length === 0) {
    return item;
  }
  const out: Partial<T> = {};
  for (const field of fields) {
    if (Object.hasOwn(item, field)) {
      out[field as keyof T] = item[field as keyof T];
    }
  }
  return out;
}

/** Build the `Paged<T>` envelope from a page of items + the next cursor, applying field projection. */
export function toPaged<T extends Record<string, unknown>>(
  items: T[],
  nextCursor: string | null,
  fields?: string[],
): Paged<Partial<T>> {
  return {
    items: fields && fields.length > 0 ? items.map((item) => projectFields(item, fields)) : items,
    nextCursor,
  };
}
