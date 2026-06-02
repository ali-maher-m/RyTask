import {
  type AnyColumn,
  type SQL,
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import {
  CLOSED_CATEGORIES,
  type CompileContext,
  type Condition,
  type FilterNode,
  PRIORITY_VALUES,
  type QueryColumns,
  type SortField,
  type SortKey,
  isGroup,
  priorityRank,
} from './filter.ast';

/**
 * The one query engine (research D6 / ADR-005): a JSON filter AST → Drizzle `SQL`
 * predicate, keyset cursor pagination, and multi-key sort. Values are ALWAYS bound
 * parameters (no string interpolation → injection-safe). Column bindings are injected
 * by the repository via `CompileContext.columns` so this stays free of `@rytask/db`.
 */

// ───────────────────────────────────────────────────────────── filter → SQL

/** Compile a filter node (group or condition) to a Drizzle predicate, or undefined if empty. */
export function compileFilter(node: FilterNode, ctx: CompileContext): SQL | undefined {
  if (isGroup(node)) {
    const parts = node.conditions
      .map((child) => compileFilter(child, ctx))
      .filter((p): p is SQL => p !== undefined);
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    return node.op === 'or' ? or(...parts) : and(...parts);
  }
  return compileCondition(node, ctx);
}

function compileCondition(cond: Condition, ctx: CompileContext): SQL {
  switch (cond.field) {
    case 'label':
      return ctx.columns.label(cond.operator, cond.value);
    case 'text':
      return ctx.columns.text(cond.value);
    case 'overdue':
      return compileOverdue(cond.value, ctx);
    case 'priority':
      return compilePriority(cond.operator, cond.value, ctx);
    default:
      return compileScalar(cond, resolveValue(cond, ctx), ctx);
  }
}

/** Map a scalar field key to its injected column. */
function scalarColumn(field: Condition['field'], columns: QueryColumns): AnyColumn {
  switch (field) {
    case 'status':
      return columns.statusId;
    case 'statusCategory':
      return columns.statusCategory;
    case 'assignee':
      return columns.assigneeId;
    case 'project':
      return columns.projectId;
    case 'parent':
      return columns.parentId;
    case 'dueDate':
      return columns.dueDate;
    case 'startDate':
      return columns.startDate;
    case 'endDate':
      return columns.endDate;
    case 'createdAt':
      return columns.createdAt;
    case 'updatedAt':
      return columns.updatedAt;
    default:
      throw new Error(`no column binding for field "${field}"`);
  }
}

/** `assignee = me` resolves to the current principal. */
function resolveValue(cond: Condition, ctx: CompileContext): unknown {
  if (cond.field === 'assignee' && cond.value === 'me') {
    return ctx.principalId;
  }
  return cond.value;
}

function compileScalar(cond: Condition, value: unknown, ctx: CompileContext): SQL {
  const c = scalarColumn(cond.field, ctx.columns);
  switch (cond.operator) {
    case 'eq':
      return eq(c, value);
    case 'neq':
      return ne(c, value);
    case 'in':
      return inArray(c, value as unknown[]);
    case 'nin':
      return notInArray(c, value as unknown[]);
    case 'before':
      return lt(c, value);
    case 'after':
      return gt(c, value);
    case 'between': {
      const [start, end] = value as [unknown, unknown];
      return and(gte(c, start), lte(c, end)) as SQL;
    }
    case 'isNull':
      return value === false ? isNotNull(c) : isNull(c);
    default:
      throw new Error(`unsupported operator "${cond.operator}" for field "${cond.field}"`);
  }
}

function compilePriority(
  operator: Condition['operator'],
  value: unknown,
  ctx: CompileContext,
): SQL {
  const c = ctx.columns.priority;
  switch (operator) {
    case 'eq':
      return eq(c, value);
    case 'neq':
      return ne(c, value);
    case 'in':
      return inArray(c, value as unknown[]);
    case 'gt':
      return inArray(
        c,
        [...PRIORITY_VALUES].filter((p) => priorityRank(p) > priorityRank(String(value))),
      );
    case 'lt':
      return inArray(
        c,
        [...PRIORITY_VALUES].filter((p) => priorityRank(p) < priorityRank(String(value))),
      );
    default:
      throw new Error(`unsupported priority operator "${operator}"`);
  }
}

/** overdue = dueDate is not null AND dueDate < today(orgTz) AND category not closed (FR-DATE-003). */
function compileOverdue(value: unknown, ctx: CompileContext): SQL {
  const open = and(
    isNotNull(ctx.columns.dueDate),
    lt(ctx.columns.dueDate, ctx.today),
    notInArray(ctx.columns.statusCategory, [...CLOSED_CATEGORIES]),
  ) as SQL;
  return value === false ? not(open) : open;
}

// ─────────────────────────────────────────────────────────── sort & keyset

/** URGENT→4 … NONE→0 (literal constants, not user input). */
function priorityRankExpr(col: AnyColumn): SQL {
  return sql`case ${col} when 'URGENT' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 when 'LOW' then 1 else 0 end`;
}

function sortColumn(field: SortField, columns: QueryColumns): AnyColumn {
  switch (field) {
    case 'dueDate':
      return columns.dueDate;
    case 'startDate':
      return columns.startDate;
    case 'endDate':
      return columns.endDate;
    case 'createdAt':
      return columns.createdAt;
    case 'updatedAt':
      return columns.updatedAt;
    case 'number':
      return columns.number;
    default:
      throw new Error(`field "${field}" is not sortable as a column`);
  }
}

function sortExpr(field: SortField, columns: QueryColumns): SQL | AnyColumn {
  return field === 'priority' ? priorityRankExpr(columns.priority) : sortColumn(field, columns);
}

/**
 * ORDER BY terms for the sort keys, with `id` appended as the total-order tiebreaker. NULLs sort
 * LAST in every direction so the order is total and agrees with the keyset predicate — otherwise
 * Postgres' direction-dependent default (`asc`→nulls-last, `desc`→nulls-first) would drift from
 * the cursor comparison and silently drop rows across page boundaries (FR-VIEW-006, SC-006).
 */
export function buildOrderBy(sort: SortKey[], ctx: CompileContext): SQL[] {
  const terms = sort.map((key) => {
    const dir = key.dir === 'desc' ? sql.raw('desc') : sql.raw('asc');
    return sql`${sortExpr(key.field, ctx.columns)} ${dir} nulls last`;
  });
  terms.push(sql`${ctx.columns.id} asc`);
  return terms;
}

/** Resolve the column to select as the group key (FR-VIEW-007). */
export function groupColumn(
  field: 'status' | 'assignee' | 'priority' | 'project',
  ctx: CompileContext,
): AnyColumn {
  switch (field) {
    case 'status':
      return ctx.columns.statusId;
    case 'assignee':
      return ctx.columns.assigneeId;
    case 'priority':
      return ctx.columns.priority;
    case 'project':
      return ctx.columns.projectId;
  }
}

// ─────────────────────────────────────────────────────────────── cursors

export const encodeCursor = (values: unknown[]): string =>
  Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');

export const decodeCursor = (cursor: string): unknown[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('invalid cursor');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('invalid cursor: expected an array tuple');
  }
  return parsed;
};

/** Extract the keyset tuple `(…sortValues, id)` from the last row of a page. */
export function cursorFromRow(row: Record<string, unknown>, sort: SortKey[]): string {
  const values = sort.map((key) => row[key.field]);
  values.push(row.id);
  return encodeCursor(values);
}

/**
 * Lexicographic keyset predicate for "rows strictly after the cursor", matching the sort
 * directions, with `id` (ascending) as the final tiebreaker. `cursorValues` is the decoded tuple
 * aligned to `sort` plus a trailing id value. All values bound.
 *
 * NULL-aware (NULLS LAST, agreeing with {@link buildOrderBy}): equality on a NULL cursor value is
 * `IS NULL` (SQL `= NULL` is never true), a NULL row sorts after any non-null value, and a NULL
 * cursor value has nothing strictly after it in that key. Without this, sorting by a nullable
 * column (`dueDate`/`startDate`/`endDate`) silently dropped rows on page ≥2 (FR-VIEW-006, SC-006).
 */
export function buildKeysetPredicate(
  sort: SortKey[],
  cursorValues: unknown[],
  ctx: CompileContext,
): SQL | undefined {
  if (cursorValues.length !== sort.length + 1) {
    return undefined;
  }

  const keys = sort.map((key, i) => ({
    expr: sortExpr(key.field, ctx.columns) as SQL | AnyColumn,
    dir: key.dir,
    val: key.field === 'priority' ? priorityRank(String(cursorValues[i])) : cursorValues[i],
  }));
  keys.push({ expr: ctx.columns.id, dir: 'asc' as const, val: cursorValues[sort.length] });

  const isNullish = (v: unknown): boolean => v === null || v === undefined;
  // Equality for a prefix key (NULL-aware): `IS NULL` when the cursor value is NULL, else `= val`.
  const eqTerm = (expr: SQL | AnyColumn, val: unknown): SQL =>
    isNullish(val) ? sql`${expr} is null` : sql`${expr} = ${val}`;
  // "Strictly after" in one key under NULLS LAST. A NULL cursor value sorts last, so nothing is
  // after it (→ null term, skipped). A NULL row is after any non-null value, hence the `is null` arm.
  const afterTerm = (expr: SQL | AnyColumn, dir: 'asc' | 'desc', val: unknown): SQL | null => {
    if (isNullish(val)) return null;
    const cmp = dir === 'asc' ? sql`${expr} > ${val}` : sql`${expr} < ${val}`;
    return sql`(${cmp} or ${expr} is null)`;
  };

  const orTerms: SQL[] = [];
  keys.forEach((k, i) => {
    const after = afterTerm(k.expr, k.dir, k.val);
    if (!after) return; // a NULL cursor value contributes no strictly-greater rows in this key
    const ands: SQL[] = [];
    for (let j = 0; j < i; j++) {
      const prev = keys[j];
      if (prev) ands.push(eqTerm(prev.expr, prev.val));
    }
    ands.push(after);
    orTerms.push(ands.length === 1 ? (ands[0] as SQL) : (and(...ands) as SQL));
  });
  if (orTerms.length === 0) return undefined;
  return orTerms.length === 1 ? orTerms[0] : (or(...orTerms) as SQL);
}
