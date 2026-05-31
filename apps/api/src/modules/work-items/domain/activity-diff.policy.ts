/**
 * Activity-diff policy (FR-WI-009, D11) — pure. Given the BEFORE and AFTER values of a
 * work item's fields, produce exactly one diff entry per changed field (field + old→new).
 * No-op edits (value unchanged) produce no entry, and fields not present in `after` are
 * left untouched (a partial PATCH only diffs the keys it carries). Used by the update/
 * move providers to write the per-field `UPDATED` activity rows in the same transaction
 * as the mutation.
 */

/** A primitive field value tracked in the activity log. */
export type FieldValue = string | number | boolean | null | undefined;

export interface FieldDiff {
  field: string;
  oldValue: FieldValue;
  newValue: FieldValue;
}

/** Equality used for diffing: by value, with `undefined`/`null` distinguished only when present. */
function changed(before: FieldValue, after: FieldValue): boolean {
  return (before ?? null) !== (after ?? null);
}

/**
 * Diff the keys present in `after` against `before`. Only keys that appear in `after`
 * are considered (a partial patch); a key whose value is unchanged yields nothing.
 */
export function diffWorkItemFields(
  before: Record<string, FieldValue>,
  after: Record<string, FieldValue>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of Object.keys(after)) {
    const oldValue = before[field] ?? null;
    const newValue = after[field] ?? null;
    if (changed(oldValue, newValue)) {
      diffs.push({ field, oldValue, newValue });
    }
  }
  return diffs;
}
