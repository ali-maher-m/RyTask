---
description: "Task list for M4 Reporting — the flagship 'Where did my time go?' report"
---

# Tasks: M4 Reporting — the flagship "Where did my time go?" report

**Input**: Design documents from `/specs/006-m4-reporting/`
**Branch**: `006-m4-reporting`

**Prerequisites**: plan.md (✓), spec.md (✓), research.md (✓ D1–D14), data-model.md (✓ zero schema change),
contracts/ (✓ reports-rest.md, web-surfaces.md), quickstart.md (✓)

**Tests**: MANDATORY (Constitution Principle V — Test-First & Enforced Coverage). Every new provider →
integration spec (real Postgres); every new route → contract spec; pure domain/web helpers → unit specs;
cross-surface reconciliation + tenancy assertions; web e2e + axe. `check-required-tests` fails the build on
any missing declared test. Write the test tasks **first within each story and ensure they FAIL** before
implementing.

**Organization**: Tasks are grouped by user story (P1→P4) so each story is independently implementable and
testable. The approach is deliberately thin — **zero schema change, zero migration, zero new dependency,
zero new MCP tool (49/49), zero new permission** (plan.md Summary; data-model §1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 (headline split) · US2 (ledger) · US3 (My week) · US4 (CSV) — setup/foundational/polish carry no label
- Exact file paths are included in every task

## Path conventions (from plan.md → Source Code)

- API module: `apps/api/src/modules/time-tracking/` (reporting read-models live **inside** the
  time-tracking module — research D1) and `apps/api/src/modules/work-items/`
- Shared contracts: `packages/contracts/src/time-tracking.contract.ts`
- Shared UI: `packages/ui/src/`
- Web: `apps/web/app/(app)/`, `apps/web/lib/`, `apps/web/e2e/`
- Gates: `scripts/` (unchanged)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the green baseline this read-only feature must preserve. There is no project
init / new dependency (data-model §1).

- [X] T001 Confirm the green baseline and the no-new-dependency invariant: run `pnpm lint`,
      `pnpm tsx scripts/check-mcp-parity.ts` (expect **49/49**), and
      `pnpm tsx scripts/check-required-tests.ts` from repo root; confirm `pnpm-lock.yaml` is unchanged
      (M4 adds no npm dependency — plan.md Constitution Check I). Record the starting counts so
      regressions are visible.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contract types, pure date/range helpers, the cross-cutting visibility-scoping
plumbing (the `/time/summary` hardening — research D3), the shared `<SplitBar>` primitive, and the report
controller shell. **Every user story depends on this phase.**

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Add the three computed read-model DTOs + `.strict()` zod query schemas to
      `packages/contracts/src/time-tracking.contract.ts` (data-model §2): `ReportOverview`,
      `ReportTotals`, `ReportWeekRow`, `ReportTopItem` (US1); `InterruptionLedger`, `LedgerItem`,
      `LedgerWeekRow` (US2); `WeeklySummary`, `WeeklyItemRow`, `CompletedItemRow` (US3); plus query
      schemas `reportRangeQuery` (`from`,`to` required `YYYY-MM-DD`, optional `projectId`/`userId` uuid)
      and `reportWeekQuery` (`weekStart` required, `userId?`). Durations are integer **seconds**; keep
      cross-field rules out of `.refine` (TS2589 — match the file's existing convention). Export the new
      types/schemas from the package barrel.
- [X] T003 [P] Write the failing unit spec
      `apps/api/src/modules/time-tracking/domain/report-range.policy.spec.ts` for the pure helpers:
      inclusive range validation (`from <= to`), 366-day max-span bound, `weekStart`-is-a-Monday check,
      and the ISO-week-list generator for `[from, to]` (UTC `date_trunc('week')`, Monday-keyed, **zero
      weeks included**). Ensure it FAILS first.
- [X] T004 Implement `apps/api/src/modules/time-tracking/domain/report-range.policy.ts` to pass T003
      (pure functions only — no I/O; mirrors the M2 date convention, research D5).
- [X] T005 [P] Write the failing integration spec for the `/time/summary` hardening in
      `apps/api/src/modules/time-tracking/providers/time-summary.provider.int.spec.ts` (extend in place):
      an org-wide (no-`projectId`) call by a non-admin member **excludes** projects they cannot read; an
      org admin still sees all; the removed-from-project edge (own logs in a project they were removed
      from drop out). Ensure it FAILS first (research D3, plan Risks).
- [X] T006 Harden org-wide visibility (research D3): in
      `apps/api/src/modules/time-tracking/providers/time-summary.provider.ts`, when `projectId` is absent
      compute `PROJECT_ACCESS.accessibleProjectIds()` and pass it into the repository; in
      `apps/api/src/modules/time-tracking/repositories/time-logs.repository.ts` make `summarize` apply
      `project_id IN (:accessibleProjectIds)` on the org-wide path. Keep the supplied-`projectId`
      `assertRole(VIEWER)` behavior unchanged. T005 goes green.
- [X] T007 [P] Create the token-only `<SplitBar>` primitive `packages/ui/src/split-bar.tsx` +
      `packages/ui/src/split-bar.module.css` (two flat segments: planned `--time-actual` honey,
      interruption `--warning` amber w/ dark ink, track `--time-track-bg`; value/label exposed as text,
      **never color-only**, WCAG AA; **no new tokens**) and export it from `packages/ui/src/index.ts`
      (data-model/plan D12; web-surfaces §2/§5).
- [X] T008 Create the controller shell
      `apps/api/src/modules/time-tracking/controllers/time-reports.controller.ts`
      (`@Controller` under `/time/reports`, class-level `@RequirePermission('work:read')`, tenant/auth
      guards as the shipped time controllers; **no route handlers yet**) and register it in
      `apps/api/src/modules/time-tracking/time-tracking.module.ts` (controllers array). Per-route providers
      are added by each story.

**Checkpoint**: Contracts, helpers, visibility scoping, the shared `<SplitBar>`, and the controller shell
exist and compile — user stories can now proceed.

---

## Phase 3: User Story 1 - The headline split: "Where did my time go?" (Priority: P1) 🎯 MVP

**Goal**: For a chosen range/scope, show total tracked time split into planned vs interruption (hours +
percentages that sum exactly to the total), led by a plain-language narrative sentence, plus a per-week
table and the top time sinks — on one skimmable screen (FR-001/002/003/004/008).

**Independent Test**: Seed classified entries across two weeks/two projects; open `/reports` for one week;
assert totals, per-class hours, percentages, narrative, per-week rows, and top items all match the seed and
`planned + interruption === total` exactly (spec US1 Independent Test).

### Tests for User Story 1 (write FIRST, ensure they FAIL) ⚠️

- [X] T009 [P] [US1] Contract spec for `GET /time/reports/overview` in
      `apps/api/src/modules/time-tracking/controllers/time-reports.controller.contract.spec.ts` (create):
      `{ data: ReportOverview }` envelope; `planned + interruption === logged`; `weeks` ascending with
      **zero rows included**; `topItems` ≤10 desc with `key` tiebreak; 400 on malformed/unknown params,
      `from > to`, span > 366d; 401 no principal; 403 on `projectId` without VIEWER; `work:read` enforced
      (contracts/reports-rest.md §1, §5).
- [X] T010 [P] [US1] Integration spec
      `apps/api/src/modules/time-tracking/providers/report-overview.provider.int.spec.ts` (real Postgres):
      totals/weeks/topItems vs seeded data; soft-deleted entries **and** entries on trashed items excluded
      (research D10); `projectId` → `assertRole`, absent → `accessibleProjectIds()` scoping (FR-013);
      UTC-day/ISO-week bucketing matches M2.

### Implementation for User Story 1

- [X] T011 [US1] Add the overview read-model queries `reportTotals`, `reportWeeks`, `reportTopItems(…,10)`
      to `apps/api/src/modules/time-tracking/repositories/time-logs.repository.ts` — conditional per-class
      `SUM(duration_seconds)` over `time_logs ⋈ work_items (deleted_at IS NULL)`, range + `scope` filter,
      `GROUP BY date_trunc('week', started_at)` for weeks, `GROUP BY work_item_id … ORDER BY logged DESC
      LIMIT 10` for top items (shared-schema joins, research D2; data-model §3).
- [X] T012 [US1] Implement `apps/api/src/modules/time-tracking/providers/report-overview.provider.ts`
      (compose the three repo queries; resolve visibility: `projectId` → `assertRole(VIEWER)` else
      `accessibleProjectIds()`; validate range via `report-range.policy`; fill zero week rows) and register
      it in `time-tracking.module.ts` (providers array).
- [X] T013 [US1] Add the `GET /time/reports/overview` handler to `time-reports.controller.ts` (zod query
      pipe with `reportRangeQuery`; returns `{ data }`) — the OpenAPI doc gains the route automatically.
- [X] T014 [US1] Update `apps/api/src/modules/time-tracking/module.testplan.ts`: add `ReportOverviewProvider`
      to `providers`, the `GET /time/reports/overview` route to the `TimeReportsController` entry, and the
      two `requiredTests` entries (T009 contract, T010 integration). Keep `mcpTools: []`.
- [X] T015 [P] [US1] Add the typed fetcher `fetchReportOverview(range, scope)` to
      `apps/web/lib/api/time.ts` (imports `ReportOverview` from `@rytask/contracts`).
- [X] T016 [P] [US1] Write the failing unit spec `apps/web/lib/report-text.spec.ts` for the narrative
      template (range, total hours, interruption share/hours/item count, planned hours; pluralization,
      zero-state, rounding — Albert/Marissa wording; web-surfaces §2/§4).
- [X] T017 [US1] Implement `narrative()` in `apps/web/lib/report-text.ts` (pure DTO→string, shared duration
      formatter) to pass T016.
- [X] T018 [US1] Create `apps/web/app/(app)/reports/page.tsx` (RSC shell + auth redirect, the 003 pattern).
- [X] T019 [US1] Create `apps/web/app/(app)/reports/reports-client.tsx` (+ `reports-client.module.css`):
      controls (range presets This/Last week, Last 2 weeks, This month, Custom from/to; project select;
      person select — presets computed client-side → explicit `from`/`to`, all synced to the URL query),
      narrative line, headline split (`<Figure>` figures + `<SplitBar>` + percentages), **By week** hairline
      table, **Top time sinks** table (rows link to item detail), and skeleton/empty/error states
      (web-surfaces §2).
- [X] T020 [P] [US1] Component spec `apps/web/app/(app)/reports/reports-client.spec.tsx` — controls + tables
      render DTO fixtures faithfully; empty/zero-state copy (web-surfaces §6).
- [X] T021 [US1] Add the **Reports** nav entry (lucide icon → `/reports`) to
      `apps/web/app/(app)/app-shell.tsx` (FR-014; web-surfaces §1).
- [X] T022 [US1] Create the e2e journey `apps/web/e2e/reports.e2e.spec.ts` covering US1 (seed → open
      `/reports` → assert split + narrative + reconciliation `planned + interruption === total`) **+ axe
      scan on `/reports`**; declare it in `apps/web/web.testplan.ts`.

**Checkpoint**: US1 is independently functional — the flagship headline report renders end-to-end and is the
shippable **MVP**.

---

## Phase 4: User Story 2 - The interruption ledger: the proof (Priority: P2)

**Goal**: The evidence layer — one row per interruption-classified item (key+title, capture source, who
raised it, entry count, hours in range, desc), plus a per-week breakdown; the ledger total equals the
headline interruption figure (FR-005/006/007).

**Independent Test**: Seed interruption entries on items from different capture sources/reporters; open the
ledger; assert each row's item/source/reporter/entry-count/hours and that the rows + the weeks each sum to
the headline interruption figure (spec US2 Independent Test).

### Tests for User Story 2 (write FIRST, ensure they FAIL) ⚠️

- [X] T023 [P] [US2] Extend `time-reports.controller.contract.spec.ts` with `GET /time/reports/interruptions`:
      `{ data: InterruptionLedger }`; only `INTERRUPTION` contributes; `Σ items.seconds === Σ weeks.seconds
      === totalSeconds`; `items` ordered seconds DESC then `key` ASC; `captureSource` from `work_items.source`
      (not the entry source); `reporter` null on removed user; 400/401/403 as §5 (contracts/reports-rest.md §2).
- [X] T024 [P] [US2] Integration spec
      `apps/api/src/modules/time-tracking/providers/interruption-ledger.provider.int.spec.ts` (real Postgres):
      ledger rows + per-week breakdown vs seed; reporter-null on removed user; reconciles to
      `report-overview` interruption total for the same scope; soft-deleted/trashed excluded; scoping.

### Implementation for User Story 2

- [X] T025 [US2] Add `ledgerItems` and `ledgerWeeks` queries to `time-logs.repository.ts` — interruption-only
      sums + counts `GROUP BY work_item_id ⋈ work_items(key,title,source,reporter_id) ⟕ users(name)
      ORDER BY seconds DESC`, and `COUNT(DISTINCT work_item_id)` per `date_trunc('week', …)` (data-model §3).
- [X] T026 [US2] Implement `apps/api/src/modules/time-tracking/providers/interruption-ledger.provider.ts`
      (same visibility resolution as US1) and register it in `time-tracking.module.ts`.
- [X] T027 [US2] Add the `GET /time/reports/interruptions` handler to `time-reports.controller.ts`.
- [X] T028 [US2] Update `module.testplan.ts`: add `InterruptionLedgerProvider`, the new route, and the two
      `requiredTests` entries (T023, T024).
- [X] T029 [P] [US2] Add the typed fetcher `fetchInterruptionLedger(range, scope)` to `apps/web/lib/api/time.ts`.
- [X] T030 [US2] Extend `apps/web/app/(app)/reports/reports-client.tsx`: the **Interruption ledger** table
      (item key link + title, M3 source-badge, "raised by" / "(removed user)", entries, hours; sorted desc;
      footer total visibly equals the headline interruption figure) + the per-week interruption sub-table;
      rows link to item detail (web-surfaces §2).
- [X] T031 [US2] Extend `apps/web/e2e/reports.e2e.spec.ts`: assert ledger total reconciles to the headline
      interruption figure and a ledger row navigates to the item detail.

**Checkpoint**: US1 + US2 both work independently — the headline number is now traceable to named items.

---

## Phase 5: User Story 3 - My week: the personal weekly summary (Priority: P3)

**Goal**: One user, one Mon–Sun week — total tracked + planned/interruption split, items they completed that
week, per-item tracked-beside-estimate, and a one-click paste-ready "Copy as text" digest (FR-009/010).

**Independent Test**: Seed one user's week with completed items, classified time, and a mix of
estimated/unestimated items; open `/reports/week`; assert totals, completed list, per-item
tracked-vs-estimate, and that the copied digest matches the on-screen figures (spec US3 Independent Test).

### Tests for User Story 3 (write FIRST, ensure they FAIL) ⚠️

- [ ] T032 [P] [US3] Extend `time-reports.controller.contract.spec.ts` with `GET /time/reports/week`:
      `weekStart` MUST be a Monday (400 plain-language message), `userId?` defaults to the principal; range
      is `weekStart..+6`; `items` desc with raw `estimateValue`; `completedItems` shape
      (contracts/reports-rest.md §3).
- [ ] T033 [P] [US3] Integration spec
      `apps/api/src/modules/time-tracking/providers/weekly-summary.provider.int.spec.ts` (real Postgres):
      totals/split; per-item logged + estimate + `completed` flag; `completedItems` via the work-items
      contract; reconciles with `GET /time/summary?groupBy=period&userId=…` for the same week; scoping.
- [ ] T034 [P] [US3] Integration spec for `listCompletedForUser` in the work-items module (e.g.
      `apps/api/src/modules/work-items/services/work-item-access.completed.int.spec.ts`): non-deleted items
      assigned to the user with `completed_at ∈ [from,to] ∩ projectIds` (research D6 — the
      `listDueAndOverdue` precedent).

### Implementation for User Story 3

- [ ] T035 [US3] Add `listCompletedForUser(userId, from, to, projectIds)` to the `WorkItemAccessService`
      interface in `apps/api/src/modules/work-items/work-items.contract.ts` (+ its return row type).
- [ ] T036 [US3] Implement `listCompletedForUser` in
      `apps/api/src/modules/work-items/services/work-item-access.service.ts` (non-deleted, `assignee_id =
      userId`, `completed_at` in range, project filter) to pass T034.
- [ ] T037 [US3] Update `apps/api/src/modules/work-items/module.testplan.ts`: declare the `listCompletedForUser`
      coverage (T034) on the access service.
- [ ] T038 [US3] Add the `weeklyItems(userId, week)` query to `time-logs.repository.ts` — per-item sums for
      one user/week `⋈ work_items(key,title,estimate_value,completed_at)` (data-model §3).
- [ ] T039 [US3] Implement `apps/api/src/modules/time-tracking/providers/weekly-summary.provider.ts`
      (validate `weekStart` is a Monday via `report-range.policy`; default `userId` to the principal; compose
      `weeklyItems` + totals + `WORK_ITEM_ACCESS.listCompletedForUser`; apply visibility scoping) and register
      it in `time-tracking.module.ts`.
- [ ] T040 [US3] Add the `GET /time/reports/week` handler to `time-reports.controller.ts` (zod
      `reportWeekQuery` pipe).
- [ ] T041 [US3] Update `module.testplan.ts` (time-tracking): add `WeeklySummaryProvider`, the new route, and
      the two `requiredTests` entries (T032, T033).
- [ ] T042 [P] [US3] Add the typed fetcher `fetchWeeklySummary(weekStart, userId?)` to `apps/web/lib/api/time.ts`.
- [ ] T043 [P] [US3] Write the failing unit spec in `apps/web/lib/report-text.spec.ts` (extend) for the
      `digest()` template (week range, total, split, completed items, top items — the paste-ready format in
      web-surfaces §4; pluralization + zero-states).
- [ ] T044 [US3] Implement `digest()` in `apps/web/lib/report-text.ts` to pass T043.
- [ ] T045 [US3] Create `apps/web/app/(app)/reports/week/page.tsx` (RSC shell + auth).
- [ ] T046 [US3] Create `apps/web/app/(app)/reports/week/week-client.tsx` (+ `week-client.module.css`): week
      picker (◀/▶, label "Mon D – Sun D", never into the future, default current ISO week, always sends a
      computed Monday), header figures + `<SplitBar>`, **What I tracked** rows (logged + shipped `<Meter>`
      tracked-vs-estimate where an estimate exists, logged-only otherwise; completed check on rows completed
      this week), **Completed this week** list with plain empty wording, and **Copy as text**
      (`navigator.clipboard.writeText` + hidden-textarea fallback, `aria-live="polite"` success)
      (web-surfaces §3).
- [ ] T047 [US3] Add the **My week** entry point: a quiet link from
      `apps/web/app/(app)/my-work/my-work-client.tsx` and the `/reports ↔ /reports/week` two-tab header
      cross-link (web-surfaces §1).
- [ ] T048 [US3] Extend `apps/web/e2e/reports.e2e.spec.ts`: open `/reports/week`, switch weeks, click **Copy
      as text** and assert the clipboard digest matches the on-screen figures, **+ axe scan on
      `/reports/week`**.

**Checkpoint**: All three report surfaces are independently functional.

---

## Phase 6: User Story 4 - Take it with you: CSV export (Priority: P4)

**Goal**: Export the current report view (split totals + interruption ledger + weeks) as a CSV honoring the
active range/scope, generated client-side from the rendered DTOs so it equals the screen exactly
(FR-011, research D7).

**Independent Test**: Apply a filter set, export, and verify the CSV rows/totals match the on-screen report;
export an empty range and verify a valid headers-only CSV (spec US4 Independent Test).

### Tests for User Story 4 (write FIRST, ensure they FAIL) ⚠️

- [ ] T049 [P] [US4] Unit spec `apps/web/lib/csv.spec.ts`: RFC-4180 quoting, the three sections (summary,
      ledger, weeks), exact equality with the input state, and the empty-range headers-only case
      (web-surfaces §4; SC-004).

### Implementation for User Story 4

- [ ] T050 [US4] Implement `apps/web/lib/csv.ts` — pure `toCsv(overview, ledger)` (RFC-4180, UTF-8, the
      three sections) + a `Blob` download helper (filename `rytask-report-<from>-<to>.csv`) — to pass T049.
- [ ] T051 [US4] Add the **Export CSV** button to `apps/web/app/(app)/reports/reports-client.tsx`,
      serializing the **already-rendered** overview + ledger state (no refetch — research D7).
- [ ] T052 [US4] Extend `apps/web/e2e/reports.e2e.spec.ts`: export CSV and assert its content matches the
      screen for the active range/scope; export an empty range → valid headers-only CSV.

**Checkpoint**: All four user stories complete and independently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: The cross-surface acceptance authorities, isolation, contract/SDK propagation, and the gate
sweep. The reconciliation and tenancy specs are **MANDATORY** (Constitution V) and gate release.

- [ ] T053 [P] **(MANDATORY — SC-002/SC-003 authority)** Cross-surface reconciliation integration spec
      `apps/api/src/modules/time-tracking/reports-reconciliation.int.spec.ts`: one fixture seeding **two
      orgs**, exercising all three report endpoints + `GET /time/summary` for the same range/scope, asserting
      `planned + interruption === logged` at every level and `overview.interruptionSeconds ===
      ledger.totalSeconds === Σ ledger weeks`; declare it in `module.testplan.ts` (contracts/README §
      Reconciliation; research D14).
- [ ] T054 [P] **(MANDATORY)** Cross-tenant assertion spec for the new ledger/weekly read-models (extend
      `apps/api/src/modules/time-tracking/repositories/time-logs.tenancy.spec.ts` or add a reports tenancy
      spec) — org B never sees org A's report rows; declare it in `module.testplan.ts` (research D14;
      Principle II).
- [ ] T055 Regenerate the SDK from OpenAPI for the three new GET operations (`packages/sdk`) and run
      `pnpm --filter web typecheck` to confirm the web fetchers stay typed (plan Project Structure;
      reports-rest §6).
- [ ] T056 Verify `pnpm tsx scripts/check-mcp-parity.ts` stays **49/49** and that
      `apps/api/src/modules/time-tracking/module.testplan.ts` keeps `mcpTools: []` with a comment citing the
      FR-RPT-009 v2 deferral (plan Complexity Tracking; research D9).
- [ ] T057 [P] Run `pnpm tsx scripts/check-design-tokens.ts` green for `<SplitBar>` and both report surfaces
      (token-only, **no new tokens**, no hex/px brand literals — Principle VIII; web-surfaces §5).
- [ ] T058 Run the full gate sweep from quickstart.md §Gates: `pnpm lint`, `pnpm --filter api test`,
      `pnpm --filter web test`, `pnpm test:integration`, `pnpm tsx scripts/check-required-tests.ts`,
      `pnpm --filter web e2e`, and `pnpm test:coverage` (thresholds hold: ≥80% line / ≥90% domain+providers).
- [ ] T059 [P] Brand-fidelity + Albert/Marissa pass on `/reports` and `/reports/week` (sentence-case kind copy,
      Geist-Mono `tabular-nums` figures, flat fills/hairlines, dark ink on honey/amber, `--time-over` red
      reserved for over-estimate) and walk quickstart.md US1–US4 verification end-to-end.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (contracts, helpers, visibility
  scoping, `<SplitBar>`, controller shell).
- **User Stories (Phases 3–6)**: each depends only on Foundational. US1→US2→US4 share `reports-client.tsx`
  and the e2e file, so their *web* tasks are sequential in priority order; backend providers/queries are
  otherwise independent. US3 is independent of US1/US2 except for the shared controller/testplan/`time.ts`.
- **Polish (Phase 7)**: T053 (reconciliation) needs all three endpoints (US1–US3); T055 needs all three
  routes; the rest gate the whole feature.

### Critical same-file sequences (NOT parallel)

- `time-reports.controller.ts`: T008 → T013 → T027 → T040
- `time-logs.repository.ts`: T006 → T011 → T025 → T038
- `time-tracking.module.ts`: T008 → T012 → T026 → T039
- `module.testplan.ts` (time-tracking): T014 → T028 → T041 → T053/T054
- `time-reports.controller.contract.spec.ts`: T009 → T023 → T032
- `reports-client.tsx`: T019 → T030 → T051
- `apps/web/lib/api/time.ts`: T015 → T029 → T042
- `apps/web/lib/report-text.ts`: T017 → T044 (specs T016 → T043)
- `apps/web/e2e/reports.e2e.spec.ts`: T022 → T031 → T048 → T052

### Within each user story

- The test tasks (contract/integration/unit) are authored FIRST and must FAIL before implementation.
- Repository queries → provider → controller route → testplan; then web fetcher → page/client → e2e.

---

## Parallel Opportunities

- **Foundational**: T002 (contracts), T003 (policy spec), T007 (`<SplitBar>`), and T005 (summary-hardening
  spec) touch different files and can run together; T004 follows T003, T006 follows T005, T008 is standalone.
- **US1 tests**: T009 and T010 in parallel. **US1 web**: T015, T016, T020 in parallel with backend T011–T013.
- **US2 tests**: T023 and T024 in parallel.
- **US3 tests**: T032, T033, T034 in parallel; T035–T037 (work-items) can proceed alongside T038–T041
  (time-tracking) since they are different modules.
- **Polish**: T053, T054, T057, T059 are independent ([P]); T055/T056/T058 run after the routes exist.

### Parallel example — User Story 1

```bash
# Author the failing US1 tests together:
Task T009: "Contract spec for GET /time/reports/overview in controllers/time-reports.controller.contract.spec.ts"
Task T010: "Integration spec in providers/report-overview.provider.int.spec.ts"

# While backend lands (T011–T013), build the parallel web pieces:
Task T015: "fetchReportOverview in apps/web/lib/api/time.ts"
Task T016: "report-text narrative spec in apps/web/lib/report-text.spec.ts"
Task T020: "reports-client component spec in app/(app)/reports/reports-client.spec.tsx"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL — blocks everything) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: the flagship headline report renders, reconciles (`planned + interruption ===
   total`), and is visibility-scoped — demo-ready MVP.

### Incremental delivery

- Foundational → **US1** (flagship split, MVP) → **US2** (ledger evidence) → **US3** (My week + digest) →
  **US4** (CSV) — each adds value without breaking the previous story. Run the Phase 7 reconciliation +
  tenancy + gate sweep before declaring the feature done.

### Parallel team strategy

- After Foundational: Dev A → US1, Dev B → US2 backend (coordinating the shared controller/repo/testplan
  edits per the same-file sequences), Dev C → US3 (work-items method + My week). US4 follows US1's
  `reports-client.tsx`.

---

## Notes

- **Read-only by contract** (FR-015): no writes, no activity rows, no notifications anywhere in this feature.
- **No new MCP tool / permission / table / migration / dependency** — `check-mcp-parity` stays 49/49;
  `pnpm-lock.yaml` unchanged; `packages/db` untouched (data-model §1).
- Exclusions are uniform: soft-deleted entries **and** entries on trashed items never contribute (research
  D10) — assert this in every provider integration spec.
- Weeks are ISO Monday–Sunday, UTC `date_trunc` (research D5); `weekStart` not a Monday → 400.
- `[P]` = different files, no incomplete dependency; respect the same-file sequences above.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
