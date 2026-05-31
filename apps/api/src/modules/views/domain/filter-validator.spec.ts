import { describe, expect, it } from 'vitest';
import { FilterValidationError, validateFilter } from './filter-validator';
import type { FilterNode } from './filter.ast';

/**
 * The filter validator rejects unknown field/operator combinations (T012) so the
 * controller can map a bad filter to 400 before it ever reaches the compiler.
 */
describe('validateFilter', () => {
  it('accepts a valid compound filter', () => {
    const ast: FilterNode = {
      op: 'and',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'URGENT' },
        {
          op: 'or',
          conditions: [
            { field: 'label', operator: 'in', value: ['bug'] },
            { field: 'overdue', operator: 'eq', value: true },
          ],
        },
      ],
    };
    expect(() => validateFilter(ast)).not.toThrow();
  });

  it('rejects an unknown field', () => {
    expect(() => validateFilter({ field: 'bogus', operator: 'eq', value: 1 } as never)).toThrow(
      FilterValidationError,
    );
  });

  it('rejects an operator not allowed for the field', () => {
    // priority does not allow `contains`
    expect(() =>
      validateFilter({ field: 'priority', operator: 'contains', value: 'x' } as never),
    ).toThrow(/operator/i);
  });

  it('rejects label `eq` (label only allows in/nin/isEmpty)', () => {
    expect(() => validateFilter({ field: 'label', operator: 'eq', value: 'x' } as never)).toThrow(
      FilterValidationError,
    );
  });

  it('validates nested groups recursively', () => {
    const ast = {
      op: 'or',
      conditions: [
        { op: 'and', conditions: [{ field: 'assignee', operator: 'before', value: 'x' }] },
      ],
    } as never;
    expect(() => validateFilter(ast)).toThrow();
  });

  it('rejects a malformed node', () => {
    expect(() => validateFilter({} as never)).toThrow(FilterValidationError);
  });
});
