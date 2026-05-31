import { type SQL, sql } from 'drizzle-orm';
import { PgDialect, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { CompileContext, QueryColumns, SortKey } from './filter.ast';
import {
  buildKeysetPredicate,
  buildOrderBy,
  cursorFromRow,
  decodeCursor,
  encodeCursor,
} from './query-compiler';

/** Keyset pagination + multi-key sort (T011, research D6 / FR-VIEW-007/010). */

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
  text: (value) => sql`title @@ websearch_to_tsquery(${value})`,
};
const ctx: CompileContext = { columns, principalId: 'u', today: '2026-05-31' };
const dialect = new PgDialect();
const renderOrderBy = (sort: SortKey[]): string =>
  buildOrderBy(sort, ctx)
    .map((t) => dialect.sqlToQuery(t).sql)
    .join(', ');

describe('buildOrderBy', () => {
  it('priority desc orders URGENT→NONE by urgency rank, with id appended as tiebreaker', () => {
    const ob = renderOrderBy([{ field: 'priority', dir: 'desc' }]);
    expect(ob.toLowerCase()).toContain('case');
    expect(ob).toContain("when 'URGENT' then 4");
    expect(ob.toLowerCase()).toContain('desc');
    // id total-order tiebreaker is always appended last, ascending.
    expect(ob).toContain('"id"');
  });

  it('multi-key sort preserves order and appends id', () => {
    const ob = renderOrderBy([
      { field: 'priority', dir: 'desc' },
      { field: 'dueDate', dir: 'asc' },
    ]);
    const idxPriority = ob.toLowerCase().indexOf('case');
    const idxDue = ob.indexOf('"due_date"');
    const idxId = ob.indexOf('"id"');
    expect(idxPriority).toBeLessThan(idxDue);
    expect(idxDue).toBeLessThan(idxId);
  });

  it('emits no OFFSET', () => {
    expect(renderOrderBy([{ field: 'number', dir: 'asc' }]).toLowerCase()).not.toContain('offset');
  });
});

describe('cursor round-trip', () => {
  it('encodes then decodes the same tuple', () => {
    const values = ['HIGH', '2026-01-01', '0193b3a0-0000-7000-8000-000000000020'];
    expect(decodeCursor(encodeCursor(values))).toEqual(values);
  });

  it('cursorFromRow extracts the sort values plus id in order', () => {
    const row = { priority: 'HIGH', dueDate: '2026-01-01', id: 'wi-1', number: 5 };
    const cursor = cursorFromRow(row, [
      { field: 'priority', dir: 'desc' },
      { field: 'dueDate', dir: 'asc' },
    ]);
    expect(decodeCursor(cursor)).toEqual(['HIGH', '2026-01-01', 'wi-1']);
  });

  it('decodeCursor rejects malformed input', () => {
    expect(() => decodeCursor('not-base64-json!!')).toThrow();
  });

  it('decodeCursor rejects a non-array tuple', () => {
    expect(() => decodeCursor(encodeCursor({ not: 'an array' } as never))).toThrow(/array/i);
  });
});

describe('buildKeysetPredicate', () => {
  it('produces a lexicographic comparison ending in the id tiebreaker, all bound', () => {
    const sortKeys: SortKey[] = [{ field: 'number', dir: 'asc' }];
    const pred = buildKeysetPredicate(sortKeys, [5, 'wi-1'], ctx) as SQL;
    const { sql: text, params } = dialect.sqlToQuery(pred);
    expect(text).toContain('"number"');
    expect(text).toContain('"id"');
    expect(text.toLowerCase()).not.toContain('offset');
    expect(params).toContain(5);
    expect(params).toContain('wi-1');
  });

  it('uses urgency rank for a priority keyset (desc → strictly less rank)', () => {
    const pred = buildKeysetPredicate(
      [{ field: 'priority', dir: 'desc' }],
      ['HIGH', 'wi-1'],
      ctx,
    ) as SQL;
    const { sql: text, params } = dialect.sqlToQuery(pred);
    expect(text.toLowerCase()).toContain('case');
    // HIGH rank = 3; desc keyset wants rows with rank < 3.
    expect(params).toContain(3);
  });

  it('returns undefined when the cursor tuple length does not match the sort keys', () => {
    // 1 sort key expects a 2-tuple (value + id); a 1-tuple is rejected.
    expect(buildKeysetPredicate([{ field: 'number', dir: 'asc' }], [5], ctx)).toBeUndefined();
  });
});
