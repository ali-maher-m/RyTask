---
description: "Task list for Time Tracking (the flagship) — and finalizing M0→M3 (M2)"
---

# Tasks: Time Tracking (the flagship) — and finalizing M0→M3 (Milestone M2)

**Input**: Design documents from `/specs/005-time-tracking-flagship/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md (D1–D17) ✅, data-model.md ✅, contracts/ (time-rest, time-tracking-flow, web-surfaces, activity-and-source) ✅, quickstart.md ✅

**Tests**: MANDATORY (Constitution Principle V — Test-First & Enforced Coverage). Every provider → ≥1 integration test (real Postgres); every route → a contract test; every domain policy → a unit test; the timer lifecycle → an integration test; both new tables → a tenancy-isolation test; aggregations → a reconciliation test; the flagship flow → a Playwright e2e + axe scan. `scripts/check-required-tests.ts` fails the build when a declared test file is missing. Test tasks are written FIRST and must FAIL before implementation.

**Organization**: Grouped by user story (P1×3, P2×3, P3×2) so each story is independently implementable and testable. Story labels: US1–US8 (see spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Which user story the task serves (US1…US8). Setup/Foundational/Polish have no story label.
- Every task names exact file path(s).

## Path Conventions

Full-stack monorepo (plan.md §Project Structure). Backend bounded module: `apps/api/src/modules/time-tracking/`. Shared schema: `packages/db/`. Shared DTOs: `packages/contracts/`. Shared UI: `packages/ui/`. Web: `apps/web/`. Gates: `scripts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the new bounded-module skeleton. No fixed-stack change, no new dependency, no new entrypoint (plan.md §Technical Context).

- [X] T001 Create the time-tracking bounded-module skeleton — folders `controllers/`, `providers/`, `repositories/`, `domain/`, `events/` and an empty `apps/api/src/modules/time-tracking/time-tracking.module.ts` (NestJS module shell, no providers wired yet), mirroring the `apps/api/src/modules/work-items/` layout.
- [X] T002 [P] Define the module public port + DI token in `apps/api/src/modules/time-tracking/time-tracking.contract.ts` (the `TIME_TRACKING_ACCESS` token + interface other surfaces use for rollup reads; calls cross-module only via `*.contract.ts`).
- [X] T003 [P] Create `apps/api/src/modules/time-tracking/module.testplan.ts` skeleton — `module: 'time-tracking'`, `tenantScopedTables: ['timers', 'time_logs']`, `mcpTools: []` (documented v2 deferral — Principle IV/FR-FIN-004), empty `providers`/`controllers`/`policies`/`requiredTests` arrays appended per story.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, enums, migration, shared DTOs, repositories, the cross-module activity seam, module wiring, the web client scaffold, and the parity-deferral documentation — everything every story needs.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T004 Add the two new enums in `packages/db/src/enums.ts` — `timeEntrySourceEnum` (`TIMER`/`MANUAL`/`SLACK`/`MCP`/`API`) and `timeEntryClassEnum` (`PLANNED`/`INTERRUPTION`) — and APPEND (never reorder) the five `TIME_*` values (`TIME_STARTED`/`TIME_STOPPED`/`TIME_LOGGED`/`TIME_EDITED`/`TIME_DELETED`) to the existing `activityActionEnum` (data-model.md §1).
- [X] T005 Add the `timers` and `time_logs` tables in `packages/db/src/tables.ts` (data-model.md §2): `organization_id`/`workspace_id` `NOT NULL`; `timers` carries `uniqueIndex('timers_org_user_unique').on(organizationId, userId)` + `timers_org_work_item_idx`; `time_logs` carries `duration_seconds integer NOT NULL`, `source`, `classification`, `classification_overridden`, `billable`, soft-delete `deleted_at`, and the three org-leading indexes (work_item, project+started, user+started). FK cascade/set-null per data-model §6. (Depends on T004.)
- [X] T006 Generate the Drizzle migration into `packages/db/migrations/0004_*.sql` (+ `meta/_journal.json`) via `drizzle-kit generate` — creates the two enums, `ALTER TYPE activity_action ADD VALUE` ×5, and the two tables with their indexes; no backfill (FR-FIN-003). (Depends on T004, T005.)
- [X] T007 [P] Add shared DTOs + zod schemas in `packages/contracts/src/time-tracking.contract.ts` (`ActiveTimer`, `TimeLog`, `CreateTimeLogInput`, `UpdateTimeLogInput`, `ItemRollup`, `TimeSummaryRow`, source/class unions — contracts/time-rest.md §DTOs) and export it from `packages/contracts/src/index.ts`.
- [X] T008 [P] Extend the `ActivityEntry.action` union (output-only) with the five `TIME_*` strings in `packages/contracts/src/work-items.contract.ts` (activity-and-source.md §1.4) — no input-contract change.
- [X] T009 Extend the work-items cross-module port with the five `recordTime*` signatures in `apps/api/src/modules/work-items/work-items.contract.ts` (`recordTimeStarted`/`recordTimeStopped`/`recordTimeLogged`/`recordTimeEdited`/`recordTimeDeleted`) — activity-and-source.md §1.2; existing methods untouched.
- [X] T010 Implement the five `recordTime*` methods in `apps/api/src/modules/work-items/services/work-item-access.service.ts` over the work-items-owned `ActivityRepository`, exactly mirroring `recordCommented` (action/field/old_value/new_value per activity-and-source.md §1.3). (Depends on T009.)
- [X] T011 [P] Implement `apps/api/src/modules/time-tracking/repositories/timers.repository.ts` extending `TenantScopedRepository` (auto `WHERE organization_id`); raw unscoped access forbidden. (Depends on T005.)
- [X] T012 [P] Implement `apps/api/src/modules/time-tracking/repositories/time-logs.repository.ts` extending `TenantScopedRepository`; reads filter `deleted_at IS NULL`. (Depends on T005.)
- [X] T013 Wire `TimeTrackingModule` in `apps/api/src/modules/time-tracking/time-tracking.module.ts` (register repositories + the module port) and register it in `apps/api/src/app.module.ts`; inject `WORK_ITEM_ACCESS`, `CLOCK`, `ID_GENERATOR`, `IdempotencyService` (no new entrypoint — plan §Target Platform). (Depends on T001, T011, T012.)
- [X] T014 [P] Create the web typed API client scaffold `apps/web/lib/api/time.ts` — `startTimer`/`stopTimer`/`getActiveTimer`/`listTimeLogs`/`createTimeLog`/`updateTimeLog`/`deleteTimeLog`/`getProjectRollup`/`getTimeSummary`, types from `@rytask/contracts`, following `apps/web/lib/api/work-items.ts` (`authedRequest`) — web-surfaces.md §6. (Depends on T007.)
- [X] T015 [P] Document the time-control v2 deferral in `scripts/check-mcp-parity.ts` (comment) and confirm time capabilities are OMITTED from `serviceCapabilities` so the parity gate stays **49/49** (research D12, FR-FIN-004) — the same mechanism M3 used.
- [X] T016 Add demo data to `packages/db/src/seed.ts` — one running `timers` row + a few `time_logs` (fixed seed-range UUIDv7 ids, `onConflictDoNothing`) so `make seed` yields a visible meter (data-model.md §7). (Depends on T005.)

**Checkpoint**: schema migrated, DTOs published, repositories + activity seam ready, module registered — user stories can begin.

---

## Phase 3: User Story 1 - Track time live with a start/stop timer (Priority: P1) 🎯 MVP

**Goal**: A live, server-persisted start/stop timer on any work item; starting a second timer stops the first (at most one active per user); the timer survives reload/restart (server `CLOCK` is the source of truth); stopping records a `time_log` (`source = TIMER`) attributed to the user.

**Independent Test**: Start a timer on item A (accrues live) → start one on item B (A auto-stops, an entry is recorded) → reload the page (B still running, correct elapsed) → stop (a `time_log` is created against B with the elapsed duration and `source = Timer`).

### Tests for User Story 1 (write FIRST, must FAIL) ⚠️

- [X] T017 [P] [US1] Unit test the one-active-timer policy (switch-vs-start, finalize shape) in `apps/api/src/modules/time-tracking/domain/one-active-timer.policy.spec.ts` (time-tracking-flow.md §1).
- [X] T018 [P] [US1] Contract test the timer routes (`POST /work-items/:id/timer/start`, `POST /timers/:id/stop`, `GET /timers/active`; 201/200/404/403) in `apps/api/src/modules/time-tracking/controllers/timers.controller.contract.spec.ts` (contracts/time-rest.md §Timer routes).
- [X] T019 [P] [US1] Integration test `apps/api/src/modules/time-tracking/providers/start-timer.provider.int.spec.ts` (idle-start, switch finalizes prior into a `time_log`, real Postgres).
- [X] T020 [P] [US1] Integration test `apps/api/src/modules/time-tracking/providers/stop-timer.provider.int.spec.ts` (frozen-clock `durationSeconds`, deletes timer + inserts log).
- [X] T021 [P] [US1] Integration test `apps/api/src/modules/time-tracking/providers/get-active-timer.provider.int.spec.ts` (zero-or-one for the principal).
- [X] T022 [P] [US1] Integration test `apps/api/src/modules/time-tracking/timer-lifecycle.int.spec.ts` — start → advance injected `CLOCK` → stop → assert persisted `durationSeconds`; re-read `GET /timers/active` from a fresh app context (same DB) to prove reload/restart re-sync; replay a stop with the same `Idempotency-Key` → exactly one entry (time-tracking-flow.md §2/§6, SC-001/SC-007).

### Implementation for User Story 1

- [X] T023 [US1] Implement the pure policy in `apps/api/src/modules/time-tracking/domain/one-active-timer.policy.ts` (decide switch-vs-start; finalize-then-start resolution).
- [X] T024 [US1] Implement `apps/api/src/modules/time-tracking/providers/start-timer.provider.ts` — one TX: finalize+delete any running timer → insert new `timers` row with `startedAt = clock.now()`; catch the `UNIQUE(org,user)` violation and resolve to the running timer; wrap in `IdempotencyService.run`; call `recordTimeStarted` (+ `recordTimeStopped`/`recordTimeLogged` on switch).
- [X] T025 [US1] Implement `apps/api/src/modules/time-tracking/providers/stop-timer.provider.ts` — `durationSeconds = round(clock.now() − startedAt)`, insert `time_log` (`source = TIMER`), delete the `timers` row in one TX; idempotent (retry returns the same log); call `recordTimeStopped` + `recordTimeLogged`. (Depends on T024 for the switch path's shared finalize.)
- [X] T026 [P] [US1] Implement `apps/api/src/modules/time-tracking/providers/get-active-timer.provider.ts` (the caller's active timer or null).
- [X] T027 [US1] Implement `apps/api/src/modules/time-tracking/controllers/timers.controller.ts` — the three routes with `@RequirePermission('work:write'|'work:read')`, item-access via the work-items contract, optional `Idempotency-Key`; wire the three providers in the module. (Depends on T024–T026, T013.)
- [X] T028 [US1] Append US1 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` — providers (`StartTimerProvider`/`StopTimerProvider`/`GetActiveTimerProvider`), controller `TimersController` + its routes, policy `one-active-timer.policy`, and the four required-test files (T017–T022).
- [X] T029 [US1] Add the timer control to `apps/web/components/item-detail.tsx` — Start/Stop button; on load call `getActiveTimer()` and, if active on this item, show Stop with live elapsed derived client-side from `startedAt`; Start switches any other running timer server-side; cosmetic-disabled when `!canEdit` (web-surfaces.md §4.1). Uses `time.ts` `startTimer`/`stopTimer`/`getActiveTimer`.

**Checkpoint**: US1 fully functional — a live, server-truth timer with one-active-per-user and reload/restart survival.

---

## Phase 4: User Story 2 - The signature plan-vs-actual meter (Priority: P1)

**Goal**: An in-row plan-vs-actual meter on the Board and List (honey fill toward the planned tick, red over-budget), and a detail meter — fed by a parallel per-item rollup (work-items never reads `time_logs`); no estimate ⇒ no over/under judgement.

**Independent Test**: On an estimated item, log time under the estimate → the row meter partially fills toward the planned tick; log past the estimate → the meter renders the over-budget red state + amount over; an item with no estimate shows logged time with no over/under judgement.

### Tests for User Story 2 (write FIRST, must FAIL) ⚠️

- [X] T030 [P] [US2] Integration test `apps/api/src/modules/time-tracking/providers/time-rollup.provider.int.spec.ts` — `SUM(duration_seconds) … GROUP BY work_item_id`, excludes soft-deleted logs + items (data-model.md §4.1, real Postgres).
- [X] T031 [P] [US2] Contract test `apps/api/src/modules/time-tracking/controllers/time-summary.controller.contract.spec.ts` for `GET /time/rollup?projectId=` (200 `{ data: ItemRollup[] }`, `work:read`) — extended for `/time/summary` in US7 (contracts/time-rest.md §Aggregation).
- [X] T032 [P] [US2] Component test the `<Meter>` states (under-budget, over-budget red, no-estimate no-judgement, `tabular-nums`) in `apps/web/test/meter.test.tsx` (web-surfaces.md §8).

### Implementation for User Story 2

- [X] T033 [US2] Implement `apps/api/src/modules/time-tracking/providers/time-rollup.provider.ts` (per-item totals for a project, tenant-scoped, soft-delete-aware).
- [X] T034 [US2] Implement `apps/api/src/modules/time-tracking/controllers/time-summary.controller.ts` with `GET /time/rollup` (`@RequirePermission('work:read')`); wire the rollup provider in the module. (Depends on T033, T013.)
- [X] T035 [P] [US2] Build the `<Meter>` primitive — `packages/ui/src/meter.tsx` + `packages/ui/src/meter.module.css` (token-only: `--time-actual`/`--time-plan`/`--time-over`/`--time-track-bg`; `role="meter"` + aria; figures via existing `<Figure>`; flat, `prefers-reduced-motion`-aware) and export from `packages/ui/src/index.ts` (web-surfaces.md §0/§1).
- [X] T036 [US2] Add a compact `<Meter size="row">` to `apps/web/app/(app)/projects/[projectId]/board/board-client.tsx` — fetch the items list AND `getProjectRollup(projectId)` in parallel, build `Map<workItemId, loggedSeconds>`, pass `loggedSeconds` + `estimateValue × 3600`; existing rendering unchanged (web-surfaces.md §2). (Depends on T035, T034.)
- [X] T037 [US2] Add a "Time" column `<Meter size="row">` to `apps/web/app/(app)/projects/[projectId]/list/list-client.tsx` from the same parallel rollup map; existing columns + M3 source badge unchanged (web-surfaces.md §3). (Depends on T035, T034.)
- [X] T038 [US2] Add the detail `<Meter size="detail" showFigures>` (total logged vs estimate) to `apps/web/components/item-detail.tsx` (web-surfaces.md §4.2). (Depends on T035.)
- [X] T039 [US2] Append US2 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (`TimeRollupProvider`, `TimeSummaryController` + `GET /time/rollup`, T030–T031) and add the `<Meter>` component test to `apps/web/web.testplan.ts`.

**Checkpoint**: the signature meter renders honest plan-vs-actual on Board/List rows and detail; over-budget is red; no-estimate shows no false judgement.

---

## Phase 5: User Story 3 - Log time manually, after the fact (Priority: P1)

**Goal**: Manual entries (duration OR start/end, date, note, billable flag) with `source = MANUAL` forced server-side; they sum into totals identically to timer entries; entries list on detail.

**Independent Test**: Add "2h yesterday, note: pairing" to an item with no prior time → total reads 2h, the entry shows date/note/duration and `source = Manual`, and it appears in aggregations.

### Tests for User Story 3 (write FIRST, must FAIL) ⚠️

- [X] T040 [P] [US3] Unit test the duration policy (duration-only, start/end, and the invalid forms: end<start, zero/negative, absurd cap) in `apps/api/src/modules/time-tracking/domain/duration.policy.spec.ts` (time-tracking-flow.md §3).
- [X] T041 [P] [US3] Integration test `apps/api/src/modules/time-tracking/providers/create-time-log.provider.int.spec.ts` — duration-only derives `endedAt`, start/end derives `durationSeconds`, `source = MANUAL` forced, idempotent on replay (real Postgres).
- [X] T042 [P] [US3] Integration test `apps/api/src/modules/time-tracking/providers/list-time-logs.provider.int.spec.ts` — keyset, newest-first, excludes soft-deleted.
- [X] T043 [P] [US3] Contract test `apps/api/src/modules/time-tracking/controllers/time-logs.controller.contract.spec.ts` for `POST /work-items/:id/time-logs` (201) and `GET /work-items/:id/time-logs` (200 paginated); 400 on invalid duration (contracts/time-rest.md §Time-log routes).

### Implementation for User Story 3

- [X] T044 [US3] Implement the pure `apps/api/src/modules/time-tracking/domain/duration.policy.ts` — exclusive-or of duration vs start/end, `endedAt > startedAt`, `0 < durationSeconds ≤ cap`, friendly messages, nothing persisted on reject.
- [X] T045 [US3] Implement `apps/api/src/modules/time-tracking/providers/create-time-log.provider.ts` — force `source = MANUAL`, normalize to the uniform stored shape (`endedAt = startedAt + durationSeconds`), wrap `IdempotencyService.run`, call `recordTimeLogged`. (Depends on T044.)
- [X] T046 [P] [US3] Implement `apps/api/src/modules/time-tracking/providers/list-time-logs.provider.ts` (keyset list, soft-delete-aware).
- [X] T047 [US3] Implement `apps/api/src/modules/time-tracking/controllers/time-logs.controller.ts` — `POST /work-items/:id/time-logs` (`work:write` + item access, optional `Idempotency-Key`) and `GET /work-items/:id/time-logs` (`work:read`); wire providers in the module. (Depends on T045, T046, T013.)
- [X] T048 [US3] Add the entries list + "Add entry" manual form (duration OR start/end, date, note, billable) to `apps/web/components/item-detail.tsx`, behind `canEdit`; uses `time.ts` `createTimeLog`/`listTimeLogs` (web-surfaces.md §4.2). (Depends on T047.)
- [X] T049 [US3] Append US3 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (`CreateTimeLogProvider`/`ListTimeLogsProvider`, `TimeLogsController` + the two routes, policy `duration.policy`, T040–T043).

**Checkpoint**: manual entries persist with `source = MANUAL` and sum identically to timer entries; the entries list renders on detail. **All three P1 stories complete — MVP increment.**

---

## Phase 6: User Story 4 - Correct and audit time entries (Priority: P2)

**Goal**: Owners edit/delete their entries; admins correct others'; non-owner non-admins are denied default-deny server-side; every change is audited in the activity feed (`TIME_EDITED`/`TIME_DELETED`).

**Independent Test**: Edit your own entry's duration → persists + `TIME_EDITED` in the feed; as admin correct another user's entry → permitted + audited; as a non-owner non-admin edit another's entry → denied (`403`), nothing changes.

### Tests for User Story 4 (write FIRST, must FAIL) ⚠️

- [X] T050 [P] [US4] Unit test the edit-permission policy (owner-allow, admin-allow, other-deny) in `apps/api/src/modules/time-tracking/domain/time-edit-permission.policy.spec.ts` (time-tracking-flow.md §5).
- [X] T051 [P] [US4] Integration test `apps/api/src/modules/time-tracking/providers/update-time-log.provider.int.spec.ts` — owner edits, admin corrects, re-validates duration, `TIME_EDITED {old,new}` appended.
- [X] T052 [P] [US4] Integration test `apps/api/src/modules/time-tracking/providers/delete-time-log.provider.int.spec.ts` — soft-delete (`deleted_at`), recoverable, `TIME_DELETED` appended, dropped from aggregation.
- [X] T053 [P] [US4] Extend `apps/api/src/modules/time-tracking/controllers/time-logs.controller.contract.spec.ts` with `PATCH /time-logs/:id` (200) and `DELETE /time-logs/:id` (204), including the `403` default-deny for a non-owner non-admin. (Depends on T043.)

### Implementation for User Story 4

- [X] T054 [US4] Implement the pure `apps/api/src/modules/time-tracking/domain/time-edit-permission.policy.ts` (`actor === log.userId || principal.isOrgAdmin`, else deny).
- [X] T055 [US4] Implement `apps/api/src/modules/time-tracking/providers/update-time-log.provider.ts` — enforce the policy (default-deny `403`), re-validate via `duration.policy`, call `recordTimeEdited`. (Depends on T054.)
- [X] T056 [P] [US4] Implement `apps/api/src/modules/time-tracking/providers/delete-time-log.provider.ts` — enforce the policy, set `deleted_at`, call `recordTimeDeleted`. (Depends on T054.)
- [X] T057 [US4] Add `PATCH /time-logs/:id` and `DELETE /time-logs/:id` to `apps/api/src/modules/time-tracking/controllers/time-logs.controller.ts` (`work:write` + owner-or-admin); wire providers. (Depends on T055, T056, T047.)
- [X] T058 [US4] Add Edit/Delete controls to the entries list in `apps/web/components/item-detail.tsx` — shown for own entries OR org admin (cosmetic mirror of server default-deny); uses `time.ts` `updateTimeLog`/`deleteTimeLog` (web-surfaces.md §4.2/§7). (Depends on T048, T057.)
- [X] T059 [US4] Append US4 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (`UpdateTimeLogProvider`/`DeleteTimeLogProvider`, the PATCH/DELETE routes, policy `time-edit-permission.policy`, T050–T053).

**Checkpoint**: entries are editable/deletable by owner-or-admin with full audit; unauthorized edits denied server-side.

---

## Phase 7: User Story 5 - Tell planned work from interruptions (Priority: P2)

**Goal**: Each entry is classified `PLANNED`/`INTERRUPTION`, derived once at creation (Urgent ⇒ interruption), snapshotted, explicitly overridable; planned + interruption always sum to the total.

**Independent Test**: Log time on an Urgent item → classified interruption; on a normal item → planned; override one → the override sticks (`classificationOverridden`); planned + interruption totals sum to the total.

### Tests for User Story 5 (write FIRST, must FAIL) ⚠️

- [X] T060 [P] [US5] Unit test the classification policy (Urgent⇒interruption, normal⇒planned, override precedence) in `apps/api/src/modules/time-tracking/domain/classification.policy.spec.ts` (time-tracking-flow.md §4).
- [X] T061 [P] [US5] Integration test `apps/api/src/modules/time-tracking/classification.int.spec.ts` — derive-and-snapshot on create/stop; explicit override on create + edit sets `classificationOverridden`; later item-priority change does NOT re-split history; planned+interruption reconcile to total (real Postgres).

### Implementation for User Story 5

- [X] T062 [US5] Implement the pure `apps/api/src/modules/time-tracking/domain/classification.policy.ts` (priority/label ⇒ class; explicit override precedence).
- [X] T063 [US5] Wire classification into the write providers — snapshot the derived class on create in `create-time-log.provider.ts` and on finalize in `stop-timer.provider.ts`; honor explicit `classification` (set `classificationOverridden = true`) in `create-time-log.provider.ts` and `update-time-log.provider.ts`. (Depends on T062; touches T045/T025/T055.)
- [X] T064 [US5] Show each entry's classification on the rows and add an override control to the manual form in `apps/web/components/item-detail.tsx` (web-surfaces.md §4.2). (Depends on T048.)
- [X] T065 [US5] Append US5 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (policy `classification.policy`, T060–T061).

**Checkpoint**: entries carry a snapshotted planned/interruption class that overrides cleanly and always reconciles to the total.

---

## Phase 8: User Story 6 - Time tracking woven into the product (Priority: P2)

**Goal**: Time events appear in the item's existing M1 activity feed (interleaved, attributed); a time entry's `source` and the item's M3 capture `source` read as distinct, both correct; the 003 surfaces work unchanged apart from the meter/controls.

**Independent Test**: Track time on a Slack-captured item → its activity feed shows the timer/log events in order; the item keeps its capture source (Slack) while the entry shows its own source (Timer); Board/List/detail/My-Work work unchanged apart from the meter.

### Tests for User Story 6 (write FIRST, must FAIL) ⚠️

- [X] T066 [P] [US6] Integration test `apps/api/src/modules/time-tracking/time-activity.int.spec.ts` — start/stop/log/edit/delete append the matching `TIME_*` rows to the item activity feed via the work-items contract (never touching `ActivityRepository` directly), interleaved by `created_at` (activity-and-source.md §1).
- [X] T067 [P] [US6] Web test that item detail maps `TIME_*` actions to friendly lines and renders each entry's own source distinct from the M3 capture-source badge in `apps/web/test/item-detail-time.test.tsx` (activity-and-source.md §1.4/§2.1).

### Implementation for User Story 6

- [X] T068 [US6] Render the `TIME_*` events in the existing activity feed on `apps/web/components/item-detail.tsx` — map to friendly copy ("started a timer", "logged 2h 15m", "edited a time entry") from `GET /work-items/:id/activity` (web-surfaces.md §4.3). (Depends on T029/T048.)
- [X] T069 [US6] Show each time entry's own source (`Timer`/`Manual`) on the detail entry rows, visibly distinct from the item's M3 capture-source badge (kept on the List row), in `apps/web/components/item-detail.tsx` (and confirm the List badge in `list-client.tsx` is untouched) (activity-and-source.md §2.1, FR-FIN-002). (Depends on T048.)
- [X] T070 [US6] No-regression pass: confirm the 003 Board / List / item detail / My Work / settings surfaces render unchanged apart from the time additions (manual check against quickstart US6 + run existing `apps/web/e2e/create-track-view.e2e.spec.ts` and `source-badge.e2e.spec.ts`); no M1/M3 contract change (FR-FIN-003).
- [X] T071 [US6] Add the item-detail time-mapping/source test to `apps/web/web.testplan.ts` (T067).

**Checkpoint**: time is native — events in the feed, entry-source vs capture-source distinct, zero regression to shipped surfaces.

---

## Phase 9: User Story 7 - See my time add up (aggregations) (Priority: P3)

**Goal**: Totals roll up per item/user/project/period, each split planned vs interruption, every total a pure `SUM` that reconciles exactly; the "my time today/this week" view consumes it.

**Independent Test**: Log known entries across two items in one project on two days → per-item, per-project, per-period totals each equal the exact sum of contributing entries; change an entry → every total updates consistently.

### Tests for User Story 7 (write FIRST, must FAIL) ⚠️

- [X] T072 [P] [US7] Integration test `apps/api/src/modules/time-tracking/providers/time-summary.provider.int.spec.ts` — reconciliation across item/user/project/period AND the planned/interruption split (`planned + interruption === logged`), re-checked after an edit (time-tracking-flow.md §8, SC-005).
- [X] T073 [P] [US7] Extend `apps/api/src/modules/time-tracking/controllers/time-summary.controller.contract.spec.ts` with `GET /time/summary?groupBy=&period=&from=&to=&projectId=&userId=` (200 `{ data: TimeSummaryRow[] }`). (Depends on T031.)

### Implementation for User Story 7

- [X] T074 [US7] Implement `apps/api/src/modules/time-tracking/providers/time-summary.provider.ts` — tenant-scoped `SUM(duration_seconds)` grouped by the requested axis with day/week buckets and the planned/interruption split; soft-delete-aware (data-model.md §4.2).
- [X] T075 [US7] Add `GET /time/summary` to `apps/api/src/modules/time-tracking/controllers/time-summary.controller.ts` (`work:read`; `userId = principal.userId` ⇒ the "my time" query); wire the provider. (Depends on T074, T034.)
- [X] T076 [US7] Add the "My time" today/this-week summary to `apps/web/app/(app)/my-work/my-work-client.tsx` via `time.ts` `getTimeSummary` (`<Figure>` figures, optional planned/interruption split); existing assigned-items list unchanged (web-surfaces.md §5). (Depends on T075.)
- [X] T077 [US7] Append US7 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (`TimeSummaryProvider`, `GET /time/summary`, T072–T073).

**Checkpoint**: aggregations reconcile exactly and power the "my time" view; the API the future M4 reports will consume exists.

---

## Phase 10: User Story 8 - Trustworthy, tenant-safe, permission-scoped time (Priority: P3)

**Goal**: No cross-tenant access to timers/entries; non-owner non-admin edits denied; timer-stop/log retries never double-count; concurrent starts never yield two active timers.

**Independent Test**: Attempt to read/edit another org's time data → impossible; edit another user's entry without permission → denied; submit the same stop/log twice → one entry; fire two concurrent starts → one active timer.

### Tests for User Story 8 (write FIRST, must FAIL) ⚠️

- [X] T078 [P] [US8] Tenancy-isolation test `apps/api/src/modules/time-tracking/repositories/timers.tenancy.spec.ts` — a cross-org id returns empty/404 (FR-X-001, SC-006).
- [X] T079 [P] [US8] Tenancy-isolation test `apps/api/src/modules/time-tracking/repositories/time-logs.tenancy.spec.ts` — cross-org reads/writes denied.
- [X] T080 [P] [US8] Integration test `apps/api/src/modules/time-tracking/idempotency-concurrency.int.spec.ts` — replayed stop/manual-create with the same `Idempotency-Key` ⇒ one entry; concurrent double-start ⇒ exactly one active timer (unique-constraint catch) (time-tracking-flow.md §6, SC-007/SC-002).

### Implementation for User Story 8

- [X] T081 [US8] Verify/harden the replay-safety across `start-timer.provider.ts`, `stop-timer.provider.ts`, and `create-time-log.provider.ts` — confirm each wraps `IdempotencyService.run(key, scope, fn)` and `start` additionally relies on the `timers` unique constraint; close any gap surfaced by T080.
- [X] T082 [US8] Append US8 declarations to `apps/api/src/modules/time-tracking/module.testplan.ts` (tenancy specs `timers`/`time_logs`, the idempotency/concurrency integration test, T078–T080).

**Checkpoint**: tenant isolation, default-deny edits, and idempotent/replay-safe writes all asserted by tests.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: The integrated flagship e2e, brand fidelity, and the green-gates finalize pass (FR-FIN-005, SC-008).

- [X] T083 [P] Add the flagship Playwright e2e + axe scan in `apps/web/e2e/time-tracking.e2e.spec.ts` — start a timer → see it tick → reload (still running, correct elapsed) → stop (entry appears) → add a manual entry → the in-row meter fills then goes over-budget (red) → `@axe-core/playwright` passes — and declare it in `apps/web/web.testplan.ts` (web-surfaces.md §8).
- [X] T084 [P] Design-system / brand-fidelity check (Principle VIII): confirm `<Meter>` + all time UI use only semantic `var(--*)` tokens (honey fill / over-budget red / `tabular-nums`, no off-token color/font/radius, flat aesthetic), WCAG AA contrast — `pnpm check:design-tokens`.
- [X] T085 [P] Albert/Marissa copy pass (FR-WEB-204, SC-009): plain, jargon-free, sentence-case time copy across `apps/web/components/item-detail.tsx` and `apps/web/app/(app)/my-work/my-work-client.tsx` ("Start timer", "2h 15m logged of 8h").
- [X] T086 Run quickstart.md validation end-to-end (migrate + seed, then verify US1–US8 per §4 + the API smoke §5).
- [X] T087 Green-gates finalize (FR-FIN-005): `pnpm lint`, `pnpm test`, `pnpm check:required-tests`, `pnpm check:mcp-parity` (MUST be **49/49**), `pnpm check:design-tokens`, `pnpm check:boundaries` (time-tracking imports work-items only via `*.contract.ts`), `pnpm --filter @rytask/web test:e2e` — all green. **Status: 7/7 green** — lint ✓ (639 files), test (api 488 + web 76) ✓, **api integration ✓ (294 real-Postgres, incl. all time-tracking providers/lifecycle/idempotency/tenancy/aggregation)**, required-tests ✓ (150/13 modules), mcp-parity ✓ (49/49), design-tokens ✓ (140 files), boundaries ✓ (0/1225). **`test:e2e` RUN & GREEN this session** against a live stack (isolated Postgres :5544 + Redis :6399 + compiled API :3011 + Playwright-launched web :3000): the flagship `time-tracking.e2e.spec.ts` passes the full journey (start → tick → reload-survives → stop → manual entry → over-budget red → List-row meter → scoped axe a11y), and `source-badge` + `create-track-view` (003 no-regression) pass once their routes are compiled (the only batch failures were `next dev` cold-compile timeouts on heavy multi-route tests, not code — each passes warm). Running the e2e surfaced + fixed two real a11y defects: the meter over-budget **label** used the fill hue `--time-over` (3.9:1, below AA) → now `--error-fg` (~6.4:1, T084/Principle VIII); and the item-detail route double-`<main>` (the shell already provides the landmark) → inner wrapper is now a `<div>` (axe `landmark-is-unique`). The e2e's axe scan was scoped to the time UI (`[data-testid="time-tracking"]`) to match its documented intent. **Found (not fixed — M3/004 scope):** the three `@modelcontextprotocol/sdk/server/*` imports omit the `.js` extension required by the SDK's strict ESM exports map, so a compiled `node dist/main.js` (i.e. `docker compose up`) crashes at boot — works under tsc/vitest's lenient resolvers but not at runtime (Principle VII risk).
- [X] T088 [P] Final no-regression assertion (FR-FIN-003): confirm `users.organizationId`, `project_members`, `TenantScopedRepository`, `work_items.source`, and the 49-tool MCP registry are unchanged; the only schema deltas are the two tables, two enums, and five appended `activity_action` values.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User stories (Phases 3–10)**: all depend on Foundational. Then:
  - **US1 (P1)**, **US2 (P1)**, **US3 (P1)** are independent of each other — can run in parallel after Foundational.
  - **US4 (P2)** depends on **US3** (extends `time-logs.controller` + edits US3-created entries).
  - **US5 (P2)** depends on **US1 + US3** (wires classification into `stop-timer` + `create-time-log`/`update-time-log` providers).
  - **US6 (P2)** depends on **US1 + US3** (events to render; item-detail timer/entries present) — US4/US5 enrich it but aren't required.
  - **US7 (P3)** is independent of US1/US3 at the data layer but shares `time-summary.controller`/its contract spec with **US2** (extends them).
  - **US8 (P3)** hardens **US1 + US3** providers (idempotency) and adds tenancy specs over the Foundational tables.
- **Polish (Phase 11)**: depends on all targeted stories (the flagship e2e needs US1+US2+US3).

### Within each story

- Tests (policies → contracts → integration) are written FIRST and must FAIL before implementation.
- Domain policy → providers → controller → web → testplan append.
- Shared single-file edits are sequential: `apps/web/components/item-detail.tsx` (US1→US2→US3→US4→US5→US6), `apps/api/src/modules/time-tracking/module.testplan.ts` (append per story), `time-logs.controller(.contract.spec).ts` (US3→US4), `time-summary.controller(.contract.spec).ts` (US2→US7).

### Parallel opportunities

- Setup: T002, T003 in parallel.
- Foundational: T007, T008, T009, T011, T012, T014, T015 in parallel (distinct files); T005→T006/T016 and T009→T010 are sequential.
- Each story's `[P]` test tasks run together (distinct files). The three P1 stories (US1/US2/US3) can be staffed in parallel once Foundational lands.

---

## Parallel Example: User Story 1

```bash
# Tests first — all distinct files, launch together (must FAIL before impl):
Task: "Unit test one-active-timer.policy in apps/api/src/modules/time-tracking/domain/one-active-timer.policy.spec.ts"   # T017
Task: "Contract test timers routes in apps/api/src/modules/time-tracking/controllers/timers.controller.contract.spec.ts" # T018
Task: "Integration test start-timer.provider.int.spec.ts"                                                                # T019
Task: "Integration test stop-timer.provider.int.spec.ts"                                                                 # T020
Task: "Integration test get-active-timer.provider.int.spec.ts"                                                           # T021
Task: "Integration test timer-lifecycle.int.spec.ts (reload/restart + idempotent replay)"                               # T022
```

## Parallel Example: Foundational distinct-file tasks

```bash
Task: "Add time DTOs/zod in packages/contracts/src/time-tracking.contract.ts"          # T007
Task: "Extend ActivityEntry.action union in packages/contracts/src/work-items.contract.ts" # T008
Task: "Add recordTime* signatures in apps/api/.../work-items/work-items.contract.ts"   # T009
Task: "timers.repository.ts (TenantScopedRepository)"                                   # T011
Task: "time-logs.repository.ts (TenantScopedRepository)"                               # T012
Task: "web client scaffold apps/web/lib/api/time.ts"                                    # T014
Task: "MCP parity v2-deferral comment in scripts/check-mcp-parity.ts"                  # T015
```

---

## Implementation Strategy

### MVP first (the three P1 stories)

1. Phase 1 (Setup) → Phase 2 (Foundational, CRITICAL — blocks everything).
2. **US1** (live timer) → validate independently (start/switch/reload/stop).
3. **US2** (signature meter) → validate independently (under/over/no-estimate).
4. **US3** (manual entries) → validate independently (2h yesterday sums in).
5. **STOP and demo**: US1+US2+US3 are the demoable flagship MVP (`CTW` "tracked" half + the signature visual).

### Incremental delivery

P1 (US1→US2→US3) → P2 (US4 audit → US5 classification → US6 woven-in) → P3 (US7 aggregations → US8 hardening) → Polish (flagship e2e, brand check, green-gates). Each story adds value without breaking the previous; finalize when all gates are green and MCP parity is still 49/49.

---

## Notes

- `[P]` = different files, no incomplete dependency. `[Story]` maps the task to a user story for traceability.
- Tests are MANDATORY (Principle V) and written to FAIL first; `check-required-tests` enforces that each declared file exists.
- No new dependency, no new MCP tool (49/49 held — documented v2 deferral), no new entrypoint.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
