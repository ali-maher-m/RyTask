# Data Model: M4 Reporting — "Where did my time go?"

**Feature**: `006-m4-reporting` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

## 1. Schema impact: NONE

M4 is **read-only**. It adds **no table, no column, no enum, no enum value, no index, and no
migration**. `packages/db/src/tables.ts` is untouched. Every report is a query-time
aggregation over data shipped by M0–M3:

| Source (owner) | Columns consumed | Why |
|---|---|---|
| `time_logs` (time-tracking, M2) | `organization_id`, `project_id`, `work_item_id`, `user_id`, `started_at`, `duration_seconds`, `classification`, `deleted_at` | the atomic unit every figure sums |
| `work_items` (work-items, M1/M3) | `id`, `key`, `title`, `source` (capture), `reporter_id`, `assignee_id`, `estimate_value`, `completed_at`, `deleted_at` | ledger metadata, weekly tracked-vs-estimate, completed list |
| `users` (identity, M0) | `id`, `name` | ledger "who raised it" display |
| `project_members` / projects contract (M0/M1) | via `accessibleProjectIds()` / `assertRole` | FR-013 visibility scoping |

Existing indexes cover every access path (research D13):
`time_logs_org_project_started_idx`, `time_logs_org_user_started_idx`,
`time_logs_org_work_item_idx`. No new index is justified at MVP scale.

## 2. Computed read-models (contract DTOs, not rows)

Defined in `packages/contracts/src/time-tracking.contract.ts` (zod schemas + types) and
returned by the three new routes. All durations are **integer seconds** (the M2 convention);
all dates are `YYYY-MM-DD`; weeks are keyed by their ISO Monday (UTC bucketing, research D5).
Every read-model is tenant-scoped by construction (`TenantScopedRepository`) and excludes
soft-deleted logs and logs of soft-deleted items (research D10).

### 2.1 `ReportOverview` — US1 (`GET /time/reports/overview`)

```ts
interface ReportOverview {
  range: { from: string; to: string };            // echo of the inclusive request range
  totals: ReportTotals;                           // whole-range sums
  weeks: ReportWeekRow[];                         // ISO weeks intersecting the range, ascending
  topItems: ReportTopItem[];                      // top 10 items by loggedSeconds, descending
}
interface ReportTotals {
  loggedSeconds: number;                          // == plannedSeconds + interruptionSeconds (SC-002)
  plannedSeconds: number;
  interruptionSeconds: number;
}
interface ReportWeekRow extends ReportTotals { weekStart: string }
interface ReportTopItem {
  workItemId: string; key: string; title: string; loggedSeconds: number;
}
```

**Invariants**: `plannedSeconds + interruptionSeconds === loggedSeconds` at every level (the
binary classification guarantees it — M2 SC-005); `weeks[].loggedSeconds` sums to
`totals.loggedSeconds`; weeks with zero logged time inside the range are included as zero rows
(the table reads continuously).

### 2.2 `InterruptionLedger` — US2 (`GET /time/reports/interruptions`)

```ts
interface InterruptionLedger {
  range: { from: string; to: string };
  totalSeconds: number;                           // == overview.totals.interruptionSeconds (SC-003)
  itemCount: number;                              // distinct items with interruption time in range
  entryCount: number;                             // contributing non-deleted entries
  items: LedgerItem[];                            // one row per item, seconds descending
  weeks: LedgerWeekRow[];                         // per-ISO-week interruption evidence, ascending
}
interface LedgerItem {
  workItemId: string; key: string; title: string;
  captureSource: 'WEB' | 'SLACK' | 'MCP' | 'API'; // work_items.source (M3) — where it came from
  reporter: { id: string; name: string } | null;  // who raised it; null when the user was removed
  entryCount: number;
  seconds: number;                                // interruption-classified seconds in range
}
interface LedgerWeekRow { weekStart: string; seconds: number; itemCount: number }
```

**Invariants**: `items[].seconds` and `weeks[].seconds` each sum to `totalSeconds`; every
ledger row's item is readable by the caller (FR-013); only `classification = 'INTERRUPTION'`
entries contribute.

### 2.3 `WeeklySummary` — US3 (`GET /time/reports/week`)

```ts
interface WeeklySummary {
  weekStart: string; weekEnd: string;             // Monday..Sunday, inclusive
  userId: string;                                 // the subject (defaults to the principal)
  totals: ReportTotals;
  items: WeeklyItemRow[];                         // items the user tracked time on, seconds descending
  completedItems: CompletedItemRow[];             // assigned-to-user, completed_at within the week
}
interface WeeklyItemRow {
  workItemId: string; key: string; title: string;
  loggedSeconds: number;
  estimateValue: string | null;                   // M1 numeric-as-string, interpreted as hours (M2 rule)
  completed: boolean;                             // completed_at within the week
}
interface CompletedItemRow {
  workItemId: string; key: string; title: string; completedAt: string; // ISO timestamp
}
```

**Invariants**: `items[].loggedSeconds` sums to `totals.loggedSeconds`; `weekStart` MUST be a
Monday (validated, 400 otherwise); `completedItems` come via the work-items contract
(`listCompletedForUser`, research D6) — never a time-tracking-owned semantic; items without an
estimate render tracked time with no comparison (the M2 meter rule).

## 3. Query shapes (repository read-models)

All in `TimeLogsRepository` (extends `TenantScopedRepository`; org filter auto-injected),
following the shipped `summarize`/`rollupByItem` idiom — shared-schema joins allowed, module
code imports forbidden (research D2):

| Read-model | Shape |
|---|---|
| `reportTotals(scope)` | `SUM(duration_seconds)` + per-class conditional sums over `time_logs ⋈ work_items(deleted_at IS NULL)`, filtered by range + scope |
| `reportWeeks(scope)` | same sums `GROUP BY date_trunc('week', started_at)` |
| `reportTopItems(scope, 10)` | sums `GROUP BY work_item_id ⋈ work_items(key,title)` `ORDER BY 2 DESC LIMIT 10` |
| `ledgerItems(scope)` | interruption-only sums + counts `GROUP BY work_item_id ⋈ work_items(key,title,source,reporter_id) ⟕ users(name)` `ORDER BY seconds DESC` |
| `ledgerWeeks(scope)` | interruption-only sums + `COUNT(DISTINCT work_item_id)` `GROUP BY date_trunc('week', …)` |
| `weeklyItems(userId, week)` | per-item sums `⋈ work_items(key,title,estimate_value,completed_at)` for one user/week |

`scope` = `{ from, to, projectId? , userId?, accessibleProjectIds }` — when `projectId` is
absent the query adds `project_id IN (…accessibleProjectIds)` (research D3). The same
hardening is applied to the existing `summarize` org-wide path.

Work-items contract addition (one method, the `listDueAndOverdue` precedent):

```ts
/** Non-deleted items assigned to `userId` with completed_at in [from, to] ∩ projectIds. */
listCompletedForUser(userId: string, from: string, to: string, projectIds: string[] | null):
  Promise<CompletedItemRow[]>
```

## 4. State transitions

None. M4 writes nothing — viewing a report leaves no activity row, no notification, no
side effect (spec FR-015). The only state M4 *reads* that changes elsewhere:
`work_items.completed_at` (maintained by M1 status transitions) and `time_logs.classification`
(maintained by M2 edit-with-audit; reports always reflect the current value on load —
recompute, never stale).

## 5. Retention & deletion semantics (inherited, unchanged)

- Soft-deleted `time_logs` (`deleted_at`) are excluded from every figure (M2 D15).
- Time on trashed items is excluded while trashed and returns on restore (research D10;
  spec edge case amended to match).
- A removed user's logs persist with `user_id = NULL`: they still count in project/org totals;
  the ledger shows `reporter: null` as "(removed user)"; the weekly summary of a removed user
  is simply never requested (no principal).
- Hard purge cascades remain M2's behavior; reports need no extra handling.
