/**
 * First-run bootstrap domain rules (research D7, FR-AUTH-010). Pure (no I/O) → unit-tested
 * at high coverage. The `/setup` flow is reachable only while zero organizations exist;
 * once any org exists it is permanently closed (409).
 */

/** First-run is available iff no organization exists yet. */
export const firstRunAvailable = (orgCount: number): boolean => orgCount === 0;

/** Derive a URL-safe org slug from its name (unique by construction on an empty DB). */
export function orgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'org';
}

/**
 * Derive a starter-project key prefix matching `^[A-Z][A-Z0-9]{1,9}$`: the org name
 * uppercased, non-alphanumerics dropped, leading non-letters stripped, 5 chars max.
 * Falls back to `TASK` when the name yields fewer than 2 usable characters.
 */
export function starterKeyPrefix(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^[^A-Z]+/, '')
    .slice(0, 5);
  return cleaned.length >= 2 ? cleaned : 'TASK';
}
