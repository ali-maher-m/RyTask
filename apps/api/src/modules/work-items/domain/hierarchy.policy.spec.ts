import { describe, expect, it } from 'vitest';
import { MAX_HIERARCHY_DEPTH, evaluateParenting } from './hierarchy.policy';

/**
 * Unit test for the hierarchy policy (T089, FR-HIER-001, research D4). Pure: given an item,
 * a proposed parent, and that parent's ancestor chain (loaded by the provider via a
 * recursive CTE), it decides whether the parenting is legal. No DB, no clock, no tenancy.
 *   - self-parenting is rejected
 *   - cycles are rejected (the new parent must not be a descendant of the item)
 *   - depth ≥ 3 is allowed; nesting beyond the cap is rejected with a clear message
 */
describe('evaluateParenting', () => {
  it('rejects self-parenting', () => {
    const r = evaluateParenting({ itemId: 'a', parentId: 'a', parentAncestorIds: [] });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected rejection');
    expect(r.reason).toBe('SELF_PARENT');
    expect(r.message).toMatch(/own parent/i);
  });

  it('rejects a cycle: the new parent is a descendant of the item', () => {
    // Item `a`; proposed parent `c` whose ancestor chain is [a, b] → `a` is an ancestor of
    // `c`, so making `a` a child of `c` would close a loop.
    const r = evaluateParenting({ itemId: 'a', parentId: 'c', parentAncestorIds: ['a', 'b'] });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected rejection');
    expect(r.reason).toBe('CYCLE');
    expect(r.message).toMatch(/cycle/i);
  });

  it('allows a normal re-parent when no cycle and within depth', () => {
    // `a` under `c`, where `c`'s chain is [root] (depth 2). `a` (height 1) lands at depth 3.
    const r = evaluateParenting({
      itemId: 'a',
      parentId: 'c',
      parentAncestorIds: ['root'],
      subtreeHeight: 1,
    });
    expect(r.ok).toBe(true);
  });

  it('allows nesting at least 3 levels deep', () => {
    // Parent at depth 2 (chain length 1), a fresh leaf child → child at depth 3. Supported.
    const r = evaluateParenting({
      itemId: 'new',
      parentId: 'lvl2',
      parentAncestorIds: ['lvl1'],
      subtreeHeight: 1,
    });
    expect(r.ok).toBe(true);
  });

  it('defaults the subtree height to 1 (a fresh leaf) when omitted', () => {
    // No subtreeHeight → treated as a single leaf; a root parent keeps it within the cap.
    const r = evaluateParenting({ itemId: 'new', parentId: 'root', parentAncestorIds: [] });
    expect(r.ok).toBe(true);
  });

  it('rejects nesting beyond the supported depth cap with a clear message', () => {
    // Parent sits at the cap (its ancestor chain already fills MAX_HIERARCHY_DEPTH levels:
    // chain length = cap → parentDepth = cap + 1); any child overflows.
    const deepChain = Array.from({ length: MAX_HIERARCHY_DEPTH }, (_v, i) => `n${i}`);
    const r = evaluateParenting({
      itemId: 'new',
      parentId: 'deep',
      parentAncestorIds: deepChain,
      subtreeHeight: 1,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected rejection');
    expect(r.reason).toBe('DEPTH_EXCEEDED');
    expect(r.message).toMatch(new RegExp(`${MAX_HIERARCHY_DEPTH}`));
    expect(r.message).toMatch(/depth/i);
  });

  it('accounts for the moved subtree height, not just the item itself', () => {
    // Re-parent `a` (which itself has a 2-tall subtree) under a parent at depth
    // MAX-1: parentDepth = MAX-1, height 2 → deepest = MAX+1 → rejected.
    const chain = Array.from({ length: MAX_HIERARCHY_DEPTH - 2 }, (_v, i) => `n${i}`);
    const r = evaluateParenting({
      itemId: 'a',
      parentId: 'p',
      parentAncestorIds: chain, // parentDepth = MAX - 1
      subtreeHeight: 2,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected rejection');
    expect(r.reason).toBe('DEPTH_EXCEEDED');
  });
});
