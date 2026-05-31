/**
 * Project validation policy (pure domain, FR-PROJ-001, data-model §2.1). No I/O — the
 * provider feeds it the candidate name/key prefix and acts on the decision. Two rules:
 *   1. `key_prefix` matches `^[A-Z][A-Z0-9]{1,9}$` (uppercase letter then 1–9 alnum).
 *      Per-workspace uniqueness is a DB constraint (unique (org, workspace, key_prefix)),
 *      surfaced as a 409 by the provider — this policy only validates the format.
 *   2. `name` is 1–120 characters (after trim).
 */

/** The canonical key-prefix shape (data-model §2.1). */
export const KEY_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export const NAME_MIN = 1;
export const NAME_MAX = 120;

/** Reason a project create/update is rejected — mapped to the right HTTP error by the provider. */
export type ProjectRejection =
  | { ok: true }
  | { ok: false; reason: 'NAME_LENGTH' }
  | { ok: false; reason: 'KEY_PREFIX_FORMAT' };

/** True iff `prefix` is a well-formed project key prefix. */
export function isValidKeyPrefix(prefix: string): boolean {
  return KEY_PREFIX_PATTERN.test(prefix);
}

/** True iff `name` (trimmed) is within the 1–120 length bound. */
export function isValidName(name: string): boolean {
  const len = name.trim().length;
  return len >= NAME_MIN && len <= NAME_MAX;
}

/**
 * Validate a project's name + key prefix (rule 1 + rule 2). The caller only persists when
 * this returns `{ ok: true }`; uniqueness of the prefix is enforced by the DB constraint.
 */
export function validateProject(input: { name: string; keyPrefix: string }): ProjectRejection {
  if (!isValidName(input.name)) {
    return { ok: false, reason: 'NAME_LENGTH' };
  }
  if (!isValidKeyPrefix(input.keyPrefix)) {
    return { ok: false, reason: 'KEY_PREFIX_FORMAT' };
  }
  return { ok: true };
}
