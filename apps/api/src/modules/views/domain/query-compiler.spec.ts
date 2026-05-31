import { type SQL, sql } from 'drizzle-orm';
import { PgDialect, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { CompileContext, FilterNode, QueryColumns, SortKey } from './filter.ast';
import { buildOrderBy, compileFilter, groupColumn } from './query-compiler';

/**
 * Unit tests for the AST → Drizzle compiler (T010, research D6, SC-006). Columns are
 * injected (the compiler never touches @rytask/db). We render the produced SQL via
 * PgDialect to assert operators, AND/OR nesting, the spec's compound case, the
 * `overdue` rule, and — critically — that values are always BOUND PARAMETERS.
 */

const wi = pgTable('work_items', {
  id: uuid('id'),
  number: integer('number'),
  title: text('title'),
  projectId: uuid('project_id'),
  statusId: uuid('status_id'),
  priority: text('priority'),
  assigneeId: uuid('assignee_id'),
  parentId: uuid('parent_id'),
  dueDate: text('due_date'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
const st = pgTable('statuses', { category: text('category') });

const columns: QueryColumns = {
  id: wi.id,
  number: wi.number,
  title: wi.title,
  projectId: wi.projectId,
  statusId: wi.statusId,
  statusCategory: st.category,
  priority: wi.priority,
  assigneeId: wi.assigneeId,
  parentId: wi.parentId,
  dueDate: wi.dueDate,
  startDate: wi.startDate,
  endDate: wi.endDate,
  createdAt: wi.createdAt,
  updatedAt: wi.updatedAt,
  label: (_op, value) => sql`label_match(${value})`,
  text: (value) => sql`${wi.title} @@ websearch_to_tsquery(${value})`,
};

const ctx: CompileContext = { columns, principalId: 'user-me', today: '2026-05-31' };

const render = (node: FilterNode): { sql: string; params: unknown[] } => {
  const dialect = new PgDialect();
  const compiled = compileFilter(node, ctx) as SQL;
  return dialect.sqlToQuery(compiled);
};

describe('compileFilter — operators', () => {
  it('eq binds the value as a parameter (no interpolation)', () => {
    const { sql: text, params } = render({ field: 'priority', operator: 'eq', value: 'URGENT' });
    expect(text).toContain('"priority" = $1');
    expect(text).not.toContain('URGENT');
    expect(params).toEqual(['URGENT']);
  });

  it('neq, in, nin', () => {
    expect(render({ field: 'status', operator: 'neq', value: 's1' }).sql).toContain('<>');
    const inq = render({ field: 'status', operator: 'in', value: ['a', 'b'] });
    expect(inq.sql).toContain('in ($1, $2)');
    expect(inq.params).toEqual(['a', 'b']);
    expect(render({ field: 'status', operator: 'nin', value: ['a'] }).sql).toContain('not in');
  });

  it('assignee = me resolves to the principal id', () => {
    const { params } = render({ field: 'assignee', operator: 'eq', value: 'me' });
    expect(params).toEqual(['user-me']);
  });

  it('assignee isNull / parent isNull', () => {
    expect(render({ field: 'assignee', operator: 'isNull' }).sql).toContain('is null');
    expect(render({ field: 'parent', operator: 'isNull' }).sql).toContain('is null');
  });

  it('priority gt/lt expand by urgency rank to a bound IN set', () => {
    // gt MEDIUM → more urgent than MEDIUM → {URGENT, HIGH}
    const gt = render({ field: 'priority', operator: 'gt', value: 'MEDIUM' });
    expect(gt.params).toEqual(expect.arrayContaining(['URGENT', 'HIGH']));
    expect(gt.params).not.toContain('LOW');
    // lt MEDIUM → less urgent → {LOW, NONE}
    const lt = render({ field: 'priority', operator: 'lt', value: 'MEDIUM' });
    expect(lt.params).toEqual(expect.arrayContaining(['LOW', 'NONE']));
  });

  it('date before/after/between', () => {
    expect(render({ field: 'dueDate', operator: 'before', value: '2026-01-01' }).sql).toContain(
      '<',
    );
    expect(render({ field: 'dueDate', operator: 'after', value: '2026-01-01' }).sql).toContain('>');
    const btw = render({
      field: 'dueDate',
      operator: 'between',
      value: ['2026-01-01', '2026-02-01'],
    });
    expect(btw.params).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('text contains delegates to the FTS builder with a bound query', () => {
    const { sql: text, params } = render({ field: 'text', operator: 'contains', value: 'login' });
    expect(text).toContain('websearch_to_tsquery');
    expect(params).toEqual(['login']);
  });
});

describe('compileFilter — overdue (FR-DATE-003)', () => {
  it('overdue=true → dueDate < today AND category NOT IN (COMPLETED, CANCELLED)', () => {
    const { sql: text, params } = render({ field: 'overdue', operator: 'eq', value: true });
    expect(text).toContain('"due_date" <');
    expect(text.toLowerCase()).toContain('not in');
    expect(params).toContain('2026-05-31');
    expect(params).toEqual(expect.arrayContaining(['COMPLETED', 'CANCELLED']));
  });
});

describe('compileFilter — nested AND/OR (SC-006)', () => {
  it('compiles `priority = URGENT AND (label in [bug] OR overdue)` exactly', () => {
    const ast: FilterNode = {
      op: 'and',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'URGENT' },
        {
          op: 'or',
          conditions: [
            { field: 'label', operator: 'in', value: ['bug-id'] },
            { field: 'overdue', operator: 'eq', value: true },
          ],
        },
      ],
    };
    const { sql: text, params } = render(ast);
    expect(text.toLowerCase()).toContain(' and ');
    expect(text.toLowerCase()).toContain(' or ');
    expect(params).toContain('URGENT');
    expect(params).toContain('bug-id');
  });

  it('never string-interpolates a malicious value', () => {
    const evil = "x'); DROP TABLE work_items;--";
    const { sql: text, params } = render({ field: 'status', operator: 'eq', value: evil });
    expect(text).not.toContain('DROP TABLE');
    expect(params).toContain(evil);
  });
});

describe('compileFilter — groups, negations & edge cases', () => {
  it('an empty group compiles to undefined (no predicate)', () => {
    expect(compileFilter({ op: 'and', conditions: [] }, ctx)).toBeUndefined();
  });

  it('a single-condition group collapses to that condition', () => {
    const { sql: text } = render({
      op: 'or',
      conditions: [{ field: 'status', operator: 'eq', value: 's1' }],
    });
    expect(text).toContain('"status_id" = $1');
    expect(text.toLowerCase()).not.toContain(' or ');
  });

  it('isNull=false negates to "is not null"', () => {
    expect(render({ field: 'assignee', operator: 'isNull', value: false }).sql).toContain(
      'is not null',
    );
  });

  it('overdue=false negates the open predicate', () => {
    expect(render({ field: 'overdue', operator: 'eq', value: false }).sql.toLowerCase()).toContain(
      'not',
    );
  });

  it('binds the remaining scalar columns (statusCategory, start/end, timestamps)', () => {
    expect(render({ field: 'statusCategory', operator: 'eq', value: 'STARTED' }).sql).toContain(
      '"category"',
    );
    expect(render({ field: 'startDate', operator: 'after', value: '2026-01-01' }).sql).toContain(
      '"start_date"',
    );
    expect(render({ field: 'endDate', operator: 'before', value: '2026-12-31' }).sql).toContain(
      '"end_date"',
    );
    expect(
      render({ field: 'createdAt', operator: 'after', value: new Date('2026-01-01') }).sql,
    ).toContain('"created_at"');
    expect(
      render({ field: 'updatedAt', operator: 'before', value: new Date('2026-12-31') }).sql,
    ).toContain('"updated_at"');
  });

  it('priority neq / in compile to bound predicates', () => {
    expect(render({ field: 'priority', operator: 'neq', value: 'LOW' }).sql).toContain('<>');
    expect(render({ field: 'priority', operator: 'in', value: ['HIGH', 'URGENT'] }).sql).toContain(
      'in ($1, $2)',
    );
  });

  it('throws on an unsupported scalar/priority operator (compiler guard)', () => {
    expect(() =>
      compileFilter({ field: 'status', operator: 'contains', value: 'x' }, ctx),
    ).toThrow();
    expect(() =>
      compileFilter({ field: 'priority', operator: 'before', value: 'x' }, ctx),
    ).toThrow();
  });
});

describe('buildOrderBy & groupColumn', () => {
  it('appends id as the total-order tiebreaker after the sort keys', () => {
    const sort: SortKey[] = [
      { field: 'priority', dir: 'desc' },
      { field: 'number', dir: 'asc' },
    ];
    const terms = buildOrderBy(sort, ctx);
    expect(terms).toHaveLength(sort.length + 1);
  });

  it('resolves each group key to a column', () => {
    for (const field of ['status', 'assignee', 'priority', 'project'] as const) {
      expect(groupColumn(field, ctx)).toBeDefined();
    }
  });
});
