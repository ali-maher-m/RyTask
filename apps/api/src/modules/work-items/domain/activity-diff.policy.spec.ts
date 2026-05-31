import { describe, expect, it } from 'vitest';
import { diffWorkItemFields } from './activity-diff.policy';

/**
 * Unit test for the activity-diff policy (T030, FR-WI-009). Pure: given a before/after
 * pair of field values, it yields exactly one entry per CHANGED field (field + old→new)
 * and zero entries for no-op edits. No DB, no clock, no tenancy.
 */
describe('diffWorkItemFields', () => {
  it('yields one entry per changed field with old→new', () => {
    const entries = diffWorkItemFields(
      { title: 'Old', priority: 'NONE', dueDate: null },
      { title: 'New', priority: 'URGENT', dueDate: '2026-07-04' },
    );
    expect(entries).toEqual([
      { field: 'title', oldValue: 'Old', newValue: 'New' },
      { field: 'priority', oldValue: 'NONE', newValue: 'URGENT' },
      { field: 'dueDate', oldValue: null, newValue: '2026-07-04' },
    ]);
  });

  it('yields no entries when nothing changed (no-op edit)', () => {
    const entries = diffWorkItemFields(
      { title: 'Same', priority: 'HIGH', assigneeId: 'u1' },
      { title: 'Same', priority: 'HIGH', assigneeId: 'u1' },
    );
    expect(entries).toEqual([]);
  });

  it('ignores fields absent from the after patch (only diffs provided keys)', () => {
    const entries = diffWorkItemFields(
      { title: 'A', priority: 'LOW' },
      { priority: 'HIGH' }, // title not in the patch → untouched
    );
    expect(entries).toEqual([{ field: 'priority', oldValue: 'LOW', newValue: 'HIGH' }]);
  });

  it('treats null→value and value→null as changes; null→null as a no-op', () => {
    const set = diffWorkItemFields({ assigneeId: null }, { assigneeId: 'u9' });
    expect(set).toEqual([{ field: 'assigneeId', oldValue: null, newValue: 'u9' }]);

    const clear = diffWorkItemFields({ dueDate: '2026-01-01' }, { dueDate: null });
    expect(clear).toEqual([{ field: 'dueDate', oldValue: '2026-01-01', newValue: null }]);

    const noop = diffWorkItemFields({ dueDate: null }, { dueDate: null });
    expect(noop).toEqual([]);
  });

  it('compares estimate numbers by value, not identity', () => {
    expect(diffWorkItemFields({ estimateValue: 3 }, { estimateValue: 3 })).toEqual([]);
    expect(diffWorkItemFields({ estimateValue: 3 }, { estimateValue: 5 })).toEqual([
      { field: 'estimateValue', oldValue: 3, newValue: 5 },
    ]);
  });
});
