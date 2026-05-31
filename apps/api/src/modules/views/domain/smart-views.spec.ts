import { describe, expect, it } from 'vitest';
import { isGroup } from './filter.ast';
import { DUE_SOON_DAYS, OPEN_CATEGORIES, SMART_VIEW_NAMES, smartViewAst } from './smart-views';

/**
 * Smart-view AST definitions (T076, filter-dsl.md / D7). These ASTs are the single
 * source for List/Board's `?smart=` and (later) the views surface, so they must match the
 * contract exactly: Overdue/Urgent/Due-Soon exclude closed (COMPLETED/CANCELLED) work,
 * and `me` resolves at compile time (left as the literal token here).
 */
const TODAY = '2026-05-31';

describe('smartViewAst', () => {
  it('my-issues / my-work resolve to `assignee = me`', () => {
    for (const name of ['my-issues', 'my-work'] as const) {
      expect(smartViewAst(name, TODAY)).toEqual({
        field: 'assignee',
        operator: 'eq',
        value: 'me',
      });
    }
  });

  it('overdue resolves to `overdue = true` (compiler excludes COMPLETED/CANCELLED)', () => {
    expect(smartViewAst('overdue', TODAY)).toEqual({
      field: 'overdue',
      operator: 'eq',
      value: true,
    });
  });

  it('urgent = priority URGENT AND status category is open (excludes closed)', () => {
    const ast = smartViewAst('urgent', TODAY);
    if (!isGroup(ast)) throw new Error('expected a group');
    expect(ast.op).toBe('and');
    expect(ast.conditions).toContainEqual({
      field: 'priority',
      operator: 'eq',
      value: 'URGENT',
    });
    const categoryCond = ast.conditions.find((c) => !isGroup(c) && c.field === 'statusCategory');
    expect(categoryCond).toEqual({
      field: 'statusCategory',
      operator: 'in',
      value: [...OPEN_CATEGORIES],
    });
    // The open set must NOT contain the closed categories (filter-dsl.md).
    expect(OPEN_CATEGORIES).not.toContain('COMPLETED');
    expect(OPEN_CATEGORIES).not.toContain('CANCELLED');
  });

  it('due-soon = dueDate between [today, today+N] AND open category', () => {
    const ast = smartViewAst('due-soon', TODAY);
    if (!isGroup(ast)) throw new Error('expected a group');
    expect(ast.op).toBe('and');
    const between = ast.conditions.find((c) => !isGroup(c) && c.field === 'dueDate');
    expect(between).toEqual({
      field: 'dueDate',
      operator: 'between',
      value: [TODAY, '2026-06-07'], // today + 7 days
    });
    expect(DUE_SOON_DAYS).toBe(7);
    expect(ast.conditions).toContainEqual({
      field: 'statusCategory',
      operator: 'in',
      value: [...OPEN_CATEGORIES],
    });
  });

  it('exposes exactly the five named smart views', () => {
    expect([...SMART_VIEW_NAMES].sort()).toEqual(
      ['due-soon', 'my-issues', 'my-work', 'overdue', 'urgent'].sort(),
    );
  });
});
