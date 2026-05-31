import type { AnyColumn, SQL } from 'drizzle-orm';

/**
 * Filter / query DSL (contracts/filter-dsl.md, research D6). Pure types + the typed
 * field registry. The compiler (`query-compiler.ts`) turns an AST into a Drizzle
 * `SQL` predicate; the validator (`filter-validator.ts`) rejects unknown
 * field/operator pairs. Column bindings are INJECTED by the repository (this domain
 * file never imports `@rytask/db` — architecture-boundary rule).
 */

export type Operator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'gt'
  | 'lt'
  | 'before'
  | 'after'
  | 'between'
  | 'isNull'
  | 'isEmpty'
  | 'contains';

/** Allowed operators per field (the typed field registry, filter-dsl.md). */
export const FIELD_REGISTRY = {
  status: ['eq', 'neq', 'in', 'nin'],
  statusCategory: ['eq', 'in'],
  priority: ['eq', 'neq', 'in', 'gt', 'lt'],
  assignee: ['eq', 'neq', 'in', 'isNull'],
  label: ['in', 'nin', 'isEmpty'],
  project: ['eq', 'in'],
  parent: ['eq', 'isNull'],
  dueDate: ['eq', 'before', 'after', 'between', 'isNull'],
  startDate: ['before', 'after', 'between', 'isNull'],
  endDate: ['before', 'after', 'between', 'isNull'],
  overdue: ['eq'],
  text: ['contains'],
  createdAt: ['before', 'after', 'between'],
  updatedAt: ['before', 'after', 'between'],
} as const satisfies Record<string, readonly Operator[]>;

export type FieldKey = keyof typeof FIELD_REGISTRY;

export interface Condition {
  field: FieldKey;
  operator: Operator;
  value?: unknown;
}

export interface Group {
  op: 'and' | 'or';
  conditions: FilterNode[];
}

export type FilterNode = Group | Condition;

export const isGroup = (node: FilterNode): node is Group =>
  (node as Group).op === 'and' || (node as Group).op === 'or';

// ───────────────────────────────────────────────────────────────── priority

/** Priority values in declared (URGENT→NONE) order; index 0 = URGENT. */
export const PRIORITY_VALUES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type Priority = (typeof PRIORITY_VALUES)[number];

/**
 * Urgency rank — URGENT highest (4), NONE lowest (0). Drives `gt`/`lt` priority
 * filters and `desc` priority sort (which therefore orders URGENT→NONE, filter-dsl.md).
 * Unknown values rank -1.
 */
export const priorityRank = (value: string): number => {
  const idx = PRIORITY_VALUES.indexOf(value as Priority);
  return idx === -1 ? -1 : PRIORITY_VALUES.length - 1 - idx;
};

// ─────────────────────────────────────────────────────────────── sort/group

export type SortDirection = 'asc' | 'desc';

export type SortField =
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'endDate'
  | 'createdAt'
  | 'updatedAt'
  | 'number';

export interface SortKey {
  field: SortField;
  dir: SortDirection;
}

export type GroupField = 'status' | 'assignee' | 'priority' | 'project';

export interface Grouping {
  field: GroupField;
}

// ────────────────────────────────────────────── injected column bindings

/**
 * The Drizzle columns/expressions the compiler needs, supplied by the repository
 * (which owns `@rytask/db`). `label`/`text` need joins/subqueries/FTS, so they are
 * provided as builder callbacks rather than bare columns.
 */
export interface QueryColumns {
  id: AnyColumn;
  number: AnyColumn;
  title: AnyColumn;
  projectId: AnyColumn;
  statusId: AnyColumn;
  /** statuses.category (the repo joins statuses). Drives statusCategory + overdue. */
  statusCategory: AnyColumn;
  priority: AnyColumn;
  assigneeId: AnyColumn;
  parentId: AnyColumn;
  dueDate: AnyColumn;
  startDate: AnyColumn;
  endDate: AnyColumn;
  createdAt: AnyColumn;
  updatedAt: AnyColumn;
  /** Label membership predicate (work_item_labels EXISTS / NOT EXISTS / empty). */
  label: (operator: Operator, value: unknown) => SQL;
  /** Full-text predicate over the generated search_vector (D8). */
  text: (value: unknown) => SQL;
}

export interface CompileContext {
  columns: QueryColumns;
  /** Resolves `assignee = me`. */
  principalId: string;
  /** Org-tz "today" as YYYY-MM-DD (Clock-derived) for overdue / due-soon. */
  today: string;
}

/** The status categories that are NOT open (used by `overdue` + smart views). */
export const CLOSED_CATEGORIES = ['COMPLETED', 'CANCELLED'] as const;
