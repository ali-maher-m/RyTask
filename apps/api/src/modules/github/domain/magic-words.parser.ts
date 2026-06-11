/**
 * Magic-word / item-key parser (M5, FR-INT-GH-006 — the `quick-add.parser` shape: pure, no I/O).
 * Extracts work-item key references from free text (commit messages, PR titles/bodies). Both
 * forms link (FR-INT-GH-006's acceptance covers the bare `ENG-142 fix`):
 *   - bare key:        `RY-12 fix the login`
 *   - magic-worded:    `Fixes RY-12`, `closes: ry-12`, `Resolved RY-12`, `refs RY-12`
 * Keys are case-insensitive in the wild (authors lowercase them); they are normalized to
 * UPPERCASE here and resolved case-insensitively downstream. A non-existent key simply doesn't
 * resolve — the parser never validates existence.
 */

export interface ItemKeyReference {
  /** Normalized UPPERCASE key, e.g. `RY-12`. */
  key: string;
  /** The lowercased magic word immediately preceding the key, or null for a bare reference. */
  magicWord: string | null;
}

/** Hard cap on distinct keys per text — a runaway generated message must not fan out unbounded. */
export const MAX_KEYS_PER_TEXT = 20;

const KEY_REFERENCE =
  /(?:\b(fix(?:e[sd])?|close[sd]?|resolve[sd]?|refs?|references)[\s:]+)?\b([A-Za-z][A-Za-z0-9]{0,9}-\d{1,9})\b/gi;

/** All distinct key references in `text`, first occurrence wins, capped at {@link MAX_KEYS_PER_TEXT}. */
export function extractItemKeys(text: string): ItemKeyReference[] {
  const seen = new Map<string, ItemKeyReference>();
  for (const match of text.matchAll(KEY_REFERENCE)) {
    const rawKey = match[2];
    if (!rawKey) continue;
    const key = rawKey.toUpperCase();
    if (!seen.has(key)) {
      seen.set(key, { key, magicWord: match[1]?.toLowerCase() ?? null });
      if (seen.size >= MAX_KEYS_PER_TEXT) break;
    }
  }
  return [...seen.values()];
}
