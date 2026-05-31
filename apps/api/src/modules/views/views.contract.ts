/**
 * Public surface of the views module (Principle III). The shared filter-AST → Drizzle
 * query engine (research D6 / ADR-005) lives in this module's `domain/`; other modules
 * (work-items list/board, search) consume it ONLY through this contract — never by
 * reaching into `views/domain/*` directly (dependency-cruiser `no-cross-module-internals`
 * exempts `*.contract.ts`). The engine is pure (no `@rytask/db`); callers inject the
 * Drizzle column bindings via `CompileContext.columns`.
 */

export {
  compileFilter,
  buildOrderBy,
  buildKeysetPredicate,
  groupColumn,
  encodeCursor,
  decodeCursor,
  cursorFromRow,
} from './domain/query-compiler';

export {
  FIELD_REGISTRY,
  PRIORITY_VALUES,
  CLOSED_CATEGORIES,
  isGroup,
  priorityRank,
} from './domain/filter.ast';

export type {
  Operator,
  FieldKey,
  Condition,
  Group,
  FilterNode,
  Priority,
  SortDirection,
  SortField,
  SortKey,
  GroupField,
  Grouping,
  QueryColumns,
  CompileContext,
} from './domain/filter.ast';

export { validateFilter, FilterValidationError } from './domain/filter-validator';

export {
  smartViewAst,
  SMART_VIEW_NAMES,
  OPEN_CATEGORIES,
  DUE_SOON_DAYS,
} from './domain/smart-views';

export type { SmartViewName } from './domain/smart-views';
