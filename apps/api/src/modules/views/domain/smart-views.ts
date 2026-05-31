import { type FilterNode } from './filter.ast';

/**
 * Smart views — code-defined, always-current filter ASTs (research D7 / filter-dsl.md).
 * They are NOT stored rows: each resolves to the correct live set for the current
 * principal at query time (`me` resolves at compile time; `today` is Clock-derived so
 * "overdue" / "due soon" stay current). This module is the SINGLE source of those ASTs —
 * the work-items list provider imports the resolver rather than inlining them.
 *
 * | name       | AST (filter-dsl.md)                                                   |
 * |------------|----------------------------------------------------------------------|
 * | my-issues  | assignee = me                                                        |
 * | my-work    | assignee = me (cross-project; the provider drops the project scope)  |
 * | due-soon   | dueDate between [today, today+N] AND statusCategory open             |
 * | overdue    | overdue = true (→ due_date < today AND category NOT closed)          |
 * | urgent     | priority = URGENT AND statusCategory open                            |
 */

/** The named smart views resolvable via `?smart=<name>` (the contract enum). */
export const SMART_VIEW_NAMES = ['my-issues', 'my-work', 'due-soon', 'overdue', 'urgent'] as const;
export type SmartViewName = (typeof SMART_VIEW_NAMES)[number];

/** Default Due-Soon horizon in days (org-configurable later — filter-dsl.md). */
export const DUE_SOON_DAYS = 7;

/**
 * The OPEN status categories — the complement of CLOSED_CATEGORIES (COMPLETED/CANCELLED).
 * "Urgent" and "Due Soon" exclude closed work; "Overdue" excludes it via the computed
 * `overdue` field. Encoded as an `in` over the open set so the compiler stays simple.
 */
export const OPEN_CATEGORIES = ['BACKLOG', 'UNSTARTED', 'STARTED'] as const;

/** Add `days` to a YYYY-MM-DD calendar date (UTC), returning YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a smart-view name to its filter AST. `today` is the org-tz "today"
 * (YYYY-MM-DD, Clock-derived) used by the date-relative views. `me` is left as the
 * literal token in the `assignee` condition — the shared compiler binds it to the
 * principal via `CompileContext.principalId`.
 */
export function smartViewAst(name: SmartViewName, today: string): FilterNode {
  switch (name) {
    case 'my-issues':
    case 'my-work':
      return { field: 'assignee', operator: 'eq', value: 'me' };
    case 'overdue':
      return { field: 'overdue', operator: 'eq', value: true };
    case 'urgent':
      return {
        op: 'and',
        conditions: [
          { field: 'priority', operator: 'eq', value: 'URGENT' },
          { field: 'statusCategory', operator: 'in', value: [...OPEN_CATEGORIES] },
        ],
      };
    case 'due-soon':
      return {
        op: 'and',
        conditions: [
          { field: 'dueDate', operator: 'between', value: [today, addDays(today, DUE_SOON_DAYS)] },
          { field: 'statusCategory', operator: 'in', value: [...OPEN_CATEGORIES] },
        ],
      };
  }
}
