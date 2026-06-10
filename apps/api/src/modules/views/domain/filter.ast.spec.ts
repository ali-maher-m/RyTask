import { describe, expect, it } from 'vitest';
import { type Condition, type Group, PRIORITY_VALUES, isGroup, priorityRank } from './filter.ast';

/**
 * Unit tests for the filter-AST leaf helpers (filter-dsl.md). `isGroup` discriminates a
 * compound node from a leaf condition; `priorityRank` drives `gt`/`lt` priority filters and
 * `desc` priority sort (URGENT highest, unknown → -1).
 */
describe('filter.ast', () => {
  describe('isGroup', () => {
    it('is true for and/or groups', () => {
      expect(isGroup({ op: 'and', conditions: [] } satisfies Group)).toBe(true);
      expect(isGroup({ op: 'or', conditions: [] } satisfies Group)).toBe(true);
    });

    it('is false for a leaf condition', () => {
      const leaf: Condition = { field: 'status', operator: 'eq', value: 'open' };
      expect(isGroup(leaf)).toBe(false);
    });
  });

  describe('priorityRank', () => {
    it('ranks URGENT highest and NONE lowest, in declared order', () => {
      expect(priorityRank('URGENT')).toBe(4);
      expect(priorityRank('HIGH')).toBe(3);
      expect(priorityRank('MEDIUM')).toBe(2);
      expect(priorityRank('LOW')).toBe(1);
      expect(priorityRank('NONE')).toBe(0);
    });

    it('ranks every declared priority as a strictly descending sequence', () => {
      const ranks = PRIORITY_VALUES.map((p) => priorityRank(p));
      expect(ranks).toEqual([4, 3, 2, 1, 0]);
    });

    it('ranks an unknown value as -1', () => {
      expect(priorityRank('BOGUS')).toBe(-1);
      expect(priorityRank('')).toBe(-1);
    });
  });
});
