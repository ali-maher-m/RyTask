# REST Contract: Reporting endpoints

**Feature**: `006-m4-reporting` | Routes live on a new `time-reports.controller.ts` in the
time-tracking module, under the existing `/api/v1/time` namespace. DTOs + zod schemas land in
`packages/contracts/src/time-tracking.contract.ts` and flow into the generated SDK
(`packages/sdk`). All three routes:

- **Method**: `GET` (read-only; no idempotency keys needed — there is no write).
- **Auth/RBAC**: session or PAT principal; `@RequirePermission('work:read')` (server-side
  guard, Principle VI). No new permission or scope.
- **Tenancy**: org resolved server-side (`TenantGuard` → AsyncLocalStorage); never
  client-supplied (Principle II).
- **Validation**: `.strict()` zod query schemas via the existing `ZodValidationPipe` —
  unknown params are 400.
- **Envelope**: `{ data: T }`, matching every shipped time route.

## Shared query semantics

| Param | Rules |
|---|---|
| `from`, `to` | `YYYY-MM-DD`, both required on overview/interruptions, inclusive; `from <= to` else 400; bounded in UTC exactly like shipped `GET /time/summary` (research D5). Max span 366 days else 400 (sanity bound, SC-005). |
| `projectId` | optional uuid. If present: `PROJECT_ACCESS.assertRole(projectId, 'VIEWER')` → 403 for non-members (org admins pass). If absent: query restricted to `accessibleProjectIds()` (FR-013). |
| `userId` | optional uuid; filters entries to one user. Visibility is still project-based — no per-user privacy rule exists (same as shipped summary `userId` filter). |

Empty result sets are **200 with zeroed totals / empty arrays** — never 404 (the empty state
is a legitimate report).

## 1. `GET /time/reports/overview` (US1)

Query: `from`, `to` (required); `projectId?`, `userId?`.

Response `{ data: ReportOverview }` — see data-model §2.1. Contract guarantees:

- `totals.plannedSeconds + totals.interruptionSeconds === totals.loggedSeconds`; same per week
  row (binary classification, SC-002).
- `weeks`: every ISO week (Monday-keyed) intersecting `[from, to]`, ascending, **zero rows
  included** — the client renders a continuous table.
- `topItems`: ≤ 10, `loggedSeconds` descending, ties broken by `key` for determinism; only
  items the caller can read.
- Week buckets count whole entries by `started_at` (an entry is never split across buckets),
  so `Σ weeks == totals` exactly.

## 2. `GET /time/reports/interruptions` (US2)

Query: `from`, `to` (required); `projectId?`, `userId?`.

Response `{ data: InterruptionLedger }` — see data-model §2.2. Contract guarantees:

- Only `classification = 'INTERRUPTION'` entries contribute.
- `Σ items[].seconds === Σ weeks[].seconds === totalSeconds`, and for any identical
  range/scope, `totalSeconds === overview.totals.interruptionSeconds` (SC-003 — asserted by
  the reconciliation integration spec).
- `items` ordered `seconds` DESC, then `key` ASC; `captureSource` is the item's M3 capture
  provenance (never the time entry's `source`); `reporter` is `null` when the reporter was
  removed (client renders "(removed user)").
- `entryCount` counts contributing non-deleted entries.

## 3. `GET /time/reports/week` (US3)

Query: `weekStart` (required, `YYYY-MM-DD`, MUST be a Monday else 400 with a plain-language
message); `userId?` (defaults to the principal — "my week"; any readable user is permitted,
visibility stays project-scoped).

Response `{ data: WeeklySummary }` — see data-model §2.3. Contract guarantees:

- Range is exactly `weekStart .. weekStart+6` inclusive.
- `items`: one row per item the subject tracked time on that week, `loggedSeconds` DESC;
  `estimateValue` is the raw M1 numeric-as-string (hours interpretation is a client concern,
  the M2 meter rule); `completed` true iff `completed_at` falls inside the week.
- `completedItems`: assigned-to-subject, `completed_at` within the week, non-deleted, within
  the caller's readable projects — fetched via the new work-items contract method
  (`listCompletedForUser`, research D6). An item can appear in `completedItems` and not in
  `items` (completed without tracked time) and vice versa.
- `totals` reconcile with `GET /time/summary?groupBy=period&userId=…` for the same week.

## 4. Hardening (shipped route, behavior change): `GET /time/summary`

When called **without** `projectId`, the aggregate is now restricted to
`accessibleProjectIds()` (previously unscoped org-wide). With `projectId` the behavior is
unchanged (`assertRole(VIEWER)`). Members' "my time" results are unchanged in practice (own
logs live in own projects); org admins see everything via their universal project access.
Covered by a dedicated integration spec; documented as FR-013/SC-007 conformance.

## 5. Errors (all plain-language, the shipped error envelope)

| Status | When |
|---|---|
| 400 | malformed/unknown params, `from > to`, span > 366 days, `weekStart` not a Monday |
| 401 | no principal |
| 403 | `projectId` supplied and caller lacks VIEWER on it; PAT without `work:read` |
| 404 | never for empty data; only for unknown `projectId`/`userId` within the org (resolved as 403/empty per the shipped summary semantics — unknown project asserts to 403 via membership, unknown user yields zeroes) |

## 6. Module & parity bookkeeping

- `time-tracking/module.testplan.ts`: +3 contract specs (one per route), +1 for the summary
  hardening; `mcpTools: []` unchanged.
- Work-items contract gains `listCompletedForUser` (+contract/integration coverage in the
  work-items testplan).
- `check-mcp-parity` stays **49/49**: reporting capabilities are omitted from
  `serviceCapabilities` with a comment citing FR-RPT-009 (v2) — the documented Principle IV
  deferral (plan.md Complexity Tracking).
- OpenAPI document gains the three routes; SDK regenerates from it (no hand-written client).
