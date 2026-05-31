/**
 * Sub-task hierarchy policy (pure domain, FR-HIER-001, research D4). No I/O — the provider
 * loads the new parent's ancestor chain (via a tenant-scoped recursive CTE) and the item's
 * current subtree depth, then feeds them here. Three rules:
 *   1. No self-parenting (an item is never its own parent).
 *   2. No cycles (the new parent must not be the item itself nor a descendant of it — i.e.
 *      the item must not appear anywhere in the new parent's ancestor chain).
 *   3. Max nesting depth: at least 3 levels are supported; nesting beyond the cap is
 *      rejected with a clear message. Depth counts levels from the root (a root item is at
 *      depth 1), so a child placed under a parent at `parentDepth` sits at `parentDepth + 1`,
 *      and the item's own subtree (height) is carried along with it.
 */

/** Supported nesting depth cap (research D4 — "max depth ≥ 3"; default cap is generous). */
export const MAX_HIERARCHY_DEPTH = 10;

/** The minimum nesting the spec guarantees (FR-HIER-001 — "at least 3 levels"). */
export const MIN_SUPPORTED_DEPTH = 3;

/** Reason a parenting operation is rejected — the provider maps it to the HTTP error. */
export type HierarchyRejection =
  | { ok: true }
  | { ok: false; reason: 'SELF_PARENT'; message: string }
  | { ok: false; reason: 'CYCLE'; message: string }
  | { ok: false; reason: 'DEPTH_EXCEEDED'; message: string };

export interface ParentingContext {
  /** The item being (re)parented / the would-be child being created. */
  itemId: string;
  /** The proposed parent's id. */
  parentId: string;
  /**
   * The proposed parent's ancestor chain, root-first, EXCLUDING the parent itself
   * (so `[]` means the parent is a root). Loaded via the recursive CTE.
   */
  parentAncestorIds: ReadonlyArray<string>;
  /**
   * Height of the item's own subtree (the item counts as 1; a leaf has height 1). When
   * (re)parenting an existing item we must keep `parentDepth + subtreeHeight` within the
   * cap. For a fresh create the new item is a leaf, so this is 1.
   */
  subtreeHeight?: number;
}

/**
 * Decide whether `itemId` may be placed under `parentId`. Pure: the provider supplies the
 * parent's ancestor chain (and the item's subtree height); this function applies the rules.
 */
export function evaluateParenting(ctx: ParentingContext): HierarchyRejection {
  // Rule 1: no self-parenting.
  if (ctx.parentId === ctx.itemId) {
    return { ok: false, reason: 'SELF_PARENT', message: 'an item cannot be its own parent' };
  }

  // Rule 2: no cycles — the item must not be an ancestor of the proposed parent.
  if (ctx.parentAncestorIds.includes(ctx.itemId)) {
    return {
      ok: false,
      reason: 'CYCLE',
      message: 'cannot set a parent that is a descendant of this item (would create a cycle)',
    };
  }

  // Rule 3: depth cap. The parent sits at depth `parentAncestorIds.length + 1` (root = 1);
  // the deepest leaf carried by the item lands at parentDepth + subtreeHeight.
  const parentDepth = ctx.parentAncestorIds.length + 1;
  const height = ctx.subtreeHeight ?? 1;
  const deepestDepth = parentDepth + height;
  if (deepestDepth > MAX_HIERARCHY_DEPTH) {
    return {
      ok: false,
      reason: 'DEPTH_EXCEEDED',
      message: `sub-task nesting exceeds the maximum supported depth of ${MAX_HIERARCHY_DEPTH} levels`,
    };
  }

  return { ok: true };
}
