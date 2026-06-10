# Phase 0 Research: M4 Reporting — "Where did my time go?"

**Feature**: `006-m4-reporting` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

All Technical Context unknowns are resolved below. No open `NEEDS CLARIFICATION` remains.
Each decision cites the shipped code it builds on — M4 invents as little as possible: it is
read-models + web surfaces over the M2 aggregation spine.

---

## D1 — Where reporting lives: inside the time-tracking module (no new module)

**Decision**: The three report read-models (overview, interruption ledger, weekly summary) are
new provider-per-operation read-models **inside `apps/api/src/modules/time-tracking`**, exposed
by a new `time-reports.controller.ts` under the existing `/time` route namespace.

**Rationale**: Aggregation over `time_logs` is time-tracking's own domain; M2 already placed
`time-rollup` and `time-summary` there (005 research D10 "query-only aggregation"). Reporting
owns **no state** — it is pure reads — so a bounded module would own zero tables and exist only
to re-export queries the time-tracking contract would have to grow anyway.

**Alternatives considered**: A new `reporting` bounded module consuming `TIME_TRACKING_ACCESS` +
`WORK_ITEM_ACCESS` — rejected for M4: it forces the time-tracking contract to grow
ledger-shaped methods (the queries still live in time-tracking), adds a module + boundary +
testplan for zero isolation gain, and the v2 reporting suite (agile charts, dashboards —
FR-RPT-003/004) is the natural trigger to extract one later. Extraction stays cheap because
M4's providers are already self-contained read-models.

## D2 — Ledger metadata via read-only shared-schema joins (the M2/search precedent)

**Decision**: The ledger and weekly read-models join `time_logs` to the shared-schema
`work_items` (key, title, capture `source`, `reporter_id`, `deleted_at`) and `users` (reporter
name) **inside `TimeLogsRepository`** (extends `TenantScopedRepository`).

**Rationale**: This is the established, documented pattern: M2's `rollupByItem`/`summarize`
already inner-join `work_items`, with the boundary rule explicitly clarified in code — "the
boundary rule only forbids importing another module's *code*" (time-logs.repository.ts §rollup,
same pattern as the search repo). Drizzle table objects come from `@rytask/db` (shared schema),
not from another module.

**Alternatives considered**: Fetching item metadata via `WORK_ITEM_ACCESS.getItemContext()` per
ledger row — rejected: N+1 contract calls to decorate an aggregate, when the join is one
indexed SQL statement and the precedent is already canon.

## D3 — Org-wide visibility scoping via `accessibleProjectIds()` (and hardening `/time/summary`)

**Decision**: Every M4 report query is restricted to projects the caller can read: when
`projectId` is supplied → `PROJECT_ACCESS.assertRole(projectId, 'VIEWER')` (M2's exact
pattern); when absent → the query filters `project_id IN accessibleProjectIds()` (the projects
contract already exposes this — it powers My Work / search intersection). Additionally, M4
**hardens the existing `GET /time/summary`** the same way: its org-wide (no-`projectId`) path
gains the same `IN accessibleProjectIds()` restriction.

**Rationale**: FR-013 / SC-007 — reports must not reveal time from unreadable projects.
Projects are membership-restricted (`work-items.contract.ts canAccess`: member or mentioned
watcher), so an unrestricted org-wide aggregate would leak other projects' totals. M2's
summary asserts only the supplied-`projectId` case; the org-wide path predates a true
cross-project surface (its only consumer is "my time", `userId = self`). M4 is the first
feature to put an org-wide aggregate on screen, so it closes the gap — and closing it for
`/time/summary` too keeps one scoping rule for all aggregation reads (members keep identical
"my time" results: their own logs live in their own projects; see Risks for the
removed-from-project edge).

**Alternatives considered**: Leaving `/time/summary` as-shipped — rejected: two aggregation
endpoints with two different visibility rules is exactly the kind of "discipline not
construction" the constitution forbids. Per-row post-filtering in the provider — rejected:
filter in SQL, not in memory.

## D4 — REST surface: three GET endpoints, one per story

**Decision**: Three read-only routes on a new controller in the time-tracking module, all
`@RequirePermission('work:read')`:

| Route | Story | Returns |
|---|---|---|
| `GET /time/reports/overview?from&to&projectId?&userId?` | US1 | totals (logged/planned/interruption), per-week rows, top items by tracked time |
| `GET /time/reports/interruptions?from&to&projectId?&userId?` | US2 | ledger rows (item, capture source, reporter, entry count, seconds) + per-week breakdown + totals |
| `GET /time/reports/week?weekStart&userId?` | US3 | one user's week: totals, per-item tracked-beside-estimate, completed items |

**Rationale**: 1:1 with the independently testable user stories; each response is exactly one
screen's data (no over-fetch); DTOs live in `@rytask/contracts` (zod + types, the single
drift-proof contract source) and flow into the generated SDK. Reusing `GET /time/summary` with
new `groupBy` axes was considered and rejected: the ledger needs joined item/reporter metadata
and the weekly needs completed-items — both would bloat a clean generic endpoint into a
kitchen-sink response.

## D5 — Date semantics: UTC day attribution, ISO weeks, client-computed presets (M2's convention)

**Decision**: Identical to shipped M2 `summarize`: `from`/`to` are inclusive `YYYY-MM-DD`
calendar days bounded in UTC (`>= from T00:00Z`, `< to+1 T00:00Z`); an entry belongs to the
day/week of its **`started_at`** moment; weeks are `date_trunc('week', …)` in UTC = ISO
Monday–Sunday, keyed by their Monday (`YYYY-MM-DD`). Range presets (this week, last week, last
2 weeks, this month) are computed **client-side** in the viewer's timezone and sent as
explicit `from`/`to`. `GET /time/reports/week` requires `weekStart` to be a Monday (400
otherwise); the client always sends a computed Monday.

**Rationale**: Consistency with every shipped M2 figure beats timezone perfection — the report
must reconcile exactly with the meters and "my time" views users already see (SC-002). A
viewer near UTC±large-offset may see a near-midnight entry bucket to the adjacent UTC day;
accepted and documented (the same is already true of M2's "my time today").

**Alternatives considered**: Per-org/per-user timezone bucketing — deferred to v2 (needs an org
timezone setting + parameterized `date_trunc … AT TIME ZONE`, and would silently diverge from
M2's shipped buckets).

## D6 — "Completed that week" = `work_items.completed_at`, items assigned to the user

**Decision**: The weekly summary's completed list = non-deleted items **assigned to the
subject user** with `completed_at` inside the week, fetched through a one-method extension of
the **work-items contract**: `WORK_ITEM_ACCESS.listCompletedForUser(userId, from, to,
projectIds)`.

**Rationale**: `completed_at` is already maintained transactionally by M1's status-transition
providers (set on entering a `COMPLETED`-category status, cleared on leaving — move/update
providers). It's a pure work-item lifecycle read with **zero** `time_logs` involvement, so it
belongs behind the work-items contract (the `listDueAndOverdue` precedent), not in a
time-tracking join. "Assigned to me" is the personal-summary ownership signal.

**Alternatives considered**: Deriving the completer from `activity` rows (who moved it) —
rejected: requires scanning the feed and breaks on bulk/board moves done by a teammate;
assignment is the honest "my work" semantic. Direct shared-schema read inside time-tracking —
allowed by D2's precedent but rejected here because no time data participates in the query.

## D7 — CSV export is built client-side from the rendered data

**Decision**: "Export CSV" serializes the **already-fetched** overview + ledger state on the
client (a small pure `toCsv` util in the web app, RFC-4180-style quoting, `Blob` +
download-link) — no new endpoint, no dependency.

**Rationale**: SC-004 demands the export match the on-screen report *exactly* — serializing
the same in-memory data makes divergence impossible by construction. Zero new server surface;
keeps the 49/49 MCP omission story clean (no REST capability without a tool that an agent
might expect).

**Alternatives considered**: A `text/csv` server endpoint — rejected for M4: a second query
path that can drift from the screen, plus contract/SDK/parity ripples; it becomes attractive
only with v2's scheduled/emailed reports (FR-RPT-006/010).

## D8 — Narrative line and copy-as-text digest are deterministic client templates

**Decision**: The plain-language narrative (US1) and the "Copy as text" digest (US3) are pure,
unit-tested template functions in the web app (`lib/report-text.ts`) fed by the fetched DTOs,
using `navigator.clipboard.writeText` (with a fallback `<textarea>` copy for older engines).
Sentence-case, jargon-free, Albert/Marissa-tested wording; numbers formatted by the existing
duration formatters.

**Rationale**: Deterministic and testable (pluralization, zero-states, rounding) — the
narrative must never contradict the figures beside it. No server text generation keeps
locale/formatting concerns out of the API contract.

## D9 — RBAC & MCP surface: `work:read` only; registry stays 49/49

**Decision**: All three routes are read-only under `@RequirePermission('work:read')`; no new
permission, role, or PAT scope. **No new MCP tools** — reports-via-MCP/API-for-BI is FR-RPT-009
(**Should, v2**); the deferral is recorded by *omission* from `serviceCapabilities` plus a
comment, byte-for-byte the M2/M3 mechanism (`module.testplan.ts` keeps `mcpTools: []`;
`check-mcp-parity` stays green at 49/49).

**Rationale**: Spec constraint ("registry stays 49/49") + the established, spec-authorized
Principle-IV deferral pattern (005 Complexity Tracking). Read-only aggregates over data the
caller can already read introduce no new authorization category.

## D10 — Trash semantics: reports exclude soft-deleted items' time (amends the spec's edge case)

**Decision**: All report figures **exclude** soft-deleted (`deleted_at`) time entries AND
entries belonging to soft-deleted (trashed) work items — the same `isNull(work_items.deleted_at)`
inner join every M2 aggregate already applies (005 research D15). Restoring from trash returns
the time to every figure. The spec's original "trashed items still count, marked" edge case is
**amended** to match (spec.md updated alongside this plan).

**Rationale**: SC-002 requires the headline, the ledger, the meters, and "my time" to
reconcile *exactly*. M2 shipped and tested exclusion; including trashed time only in M4
reports would make the report disagree with every other surface — the worse lie. One rule
everywhere is the defensible-in-a-1:1 behavior.

## D11 — Web information architecture: `/reports` + `/reports/week`, one nav entry

**Decision**: The sidebar (`app-shell.tsx`) gains one **Reports** entry → `/reports` (the
flagship one-screen report: range/scope controls, narrative, headline split, per-week table,
top items, interruption ledger, Export CSV). **My week** lives at `/reports/week` (week
picker, totals, tracked-beside-estimate rows, completed list, Copy as text), cross-linked as a
tab-style toggle from `/reports` and linked from My Work. Both follow the established
`page.tsx` (RSC shell + auth) + `*-client.tsx` pattern with the shared loading/empty/error
surface-feedback components.

**Rationale**: PRD §8.2 — "one screen, skimmable by a non-technical manager; plain-language
summary on top, drill-down below". The ledger is the flagship report's drill-down, not a
separate destination; My week is a different subject (me + one week) and deserves its own URL
for sharing/bookmarking.

## D12 — Visual language: figures-first, existing tokens only, no chart library

**Decision**: The headline split renders as Geist-Mono `tabular-nums` figures plus a single
flat two-segment split bar (planned = `--time-actual` honey, interruption = `--warning` amber,
track = `--time-track-bg`), built as a small token-only `<SplitBar>` (or extension of
`<Meter>`) in `packages/ui`. Per-week and top-items render as hairline tables of figures (the
existing list idiom). Tracked-beside-estimate rows in My week reuse the shipped `<Meter>`.
Segments never rely on color alone (labels + figures adjacent, WCAG AA, dark ink on amber).
**No new tokens; no chart dependency.**

**Rationale**: Trend *charts* are explicitly v2 — the MVP per-week breakdown is tabular
evidence, not visualization, so a chart library (new dependency → Principle I friction) is
unjustified. Honey already means time/momentum (brand rule); amber is one of the three
permitted semantic hues and reads "caution/urgent" without claiming error. Red stays reserved
for over-budget (`--time-over`).

## D13 — Performance: single indexed aggregates, no N+1, LIMIT on top items

**Decision**: Each endpoint is 1–3 tenant-scoped SQL aggregates over the existing composite
indexes — `time_logs_org_project_started_idx` and `time_logs_org_user_started_idx` cover every
range filter; the ledger groups by `work_item_id` with a `HAVING` on interruption seconds and
joins items/users once; top items carry `LIMIT 10`. No new index, no new cache.

**Rationale**: SC-005 (<2 s for a 25-user org-year) is comfortably met by indexed
`SUM … GROUP BY` over at most ~10⁵ rows; M2's reconciliation tests already exercise the same
shape. Pagination of the ledger is unnecessary at MVP scale (interruption *items* per range
are dozens, not thousands); revisit with v2 filters.

## D14 — Testing strategy (closed policy mapping)

**Decision**: Extend the existing testplans — no new gate, no new harness:

- `time-tracking/module.testplan.ts`: +3 provider integration specs (real Postgres), +1
  contract spec per new route (supertest), +1 integration spec for the `/time/summary`
  scoping hardening, +1 cross-surface **reconciliation** integration spec (ledger total ==
  overview interruption == summary totals for the same fixture, SC-002/SC-003), +unit specs
  for the pure week/range domain helpers (Monday validation, inclusive bounds), +a
  cross-tenant assertion for the new ledger/weekly read-models (same fixture pattern as the
  M2 tenancy specs). `mcpTools: []` stays.
- `work-items` testplan: +contract/integration coverage for `listCompletedForUser`.
- `apps/web/web.testplan.ts`: +`e2e/reports.e2e.spec.ts` (US1→US4 journey: seed → open
  `/reports` → assert split + narrative + ledger reconciliation → export CSV and assert
  content → `/reports/week` → copy-as-text assert clipboard → axe scans on both surfaces);
  +unit specs for `report-text` (narrative/digest) and `toCsv`.
- Gates untouched: `check-required-tests`, `check-mcp-parity` (49/49), `check-design-tokens`,
  boundaries, coverage thresholds.

**Rationale**: Constitution Principle V; every spec SC maps to an automated check (SC-002/003
→ reconciliation spec + e2e; SC-004 → CSV/clipboard e2e + unit; SC-005 → existing perf budget
pattern; SC-007 → scoping integration tests).
