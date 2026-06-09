# Feature Specification: Time Tracking (the flagship) — and finalizing M0→M3 (Milestone M2)

**Feature Branch**: `005-time-tracking-flagship`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "m2 frontend and backend and finalize from m0 to m3"

## Overview

This feature delivers **M2 — "Time tracking"**, the milestone the BRD calls the **flagship** (`knowledge/BRD.md` §9, roadmap `M0 ──► M1 ──► M2 ──► M3`). It is the half of the North-Star metric that the product is named for: **CTW = Tasks Captured-and-Tracked per Active User per Week** — M1 and M3 nailed *captured*; this milestone makes *tracked* real. It is also the engine behind differentiator **D1/D6** — *free, native time-tracking with honest plan-vs-actual* — the thing every competitor either paywalls (Jira/Tempo, ClickUp, Plane) or omits.

M2 was deliberately built **out of order**: the team shipped M0 (Identity, Tenancy & Onboarding), M1 (Core Work Loop), the 003 web app, and M3 (Fast Capture — Slack & MCP) first, leaving an **M2-shaped hole** in the middle of the sequence. This feature fills that hole, full-stack, and **finalizes the M0→M3 product slice** so the four shipped milestones cohere into one shippable Stage-1 product.

It is **full-stack** and has two intertwined goals:

1. **Time tracking** (the new capability, differentiator **D1/D6**) — a live, server-persisted **start/stop timer** on any work item; **manual time entries**; **edit/delete with audit**; **source attribution** on every entry; **aggregations** per item/user/project/period; and **planned-vs-interruption tagging**. One brain: time is logged through the same domain model, tenancy, and RBAC as everything else.
2. **Finalizing M0→M3** (integration, not new capability) — wiring time tracking into the surfaces that already exist so the product is whole: the **signature in-row plan-vs-actual time meter** on the M1 Board/List rows and item detail, time events in the M1 **activity feed**, **time-entry source** consistent with M3's `work_items.source`, and **all M0→M3 CI gates kept green** (lint, unit, integration against real Postgres, required-tests, boundaries, and **MCP parity held at 49/49**).

**Scope frame**: the **MVP `Must` subset** of M2 per `knowledge/REQUIREMENTS.md`, `knowledge/BRD.md` §9, and `knowledge/BUILD-PLAYBOOK.md` — `FR-TT-001…006` and `FR-TT-009` — delivered as **web + REST API**, plus the integration/finalization work above. Per the locked scope decision for this spec: **no pull-forward** — Slack/MCP time *control* (`FR-TT-010`, v2) and the weekly **Time / Interruption Reports** (`FR-RPT-*`, milestone **M4**) stay in their own milestones; the MCP parity surface does **not** grow (time tools remain a documented v2 deferral, the same pattern M3 used). These boundaries are enumerated in **Out of Scope**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track time live with a start/stop timer (Priority: P1)

As a teammate doing the work, I start a timer on the item I'm working on with one click; the elapsed time accrues live; when I switch tasks, starting a timer on the new item stops the old one; and when I stop (or reload the page, or the server restarts) the accrued time is preserved exactly — because the server, not my browser tab, is the source of truth.

**Why this priority**: The live timer is the lowest-friction path to honest time data and the foundation every aggregation, meter, and later report is built on. Without it there is no M2.

**Independent Test**: Start a timer on item A, confirm it accrues live; start a timer on item B and confirm A stops automatically; reload the page and confirm B's timer is still running with the correct elapsed time; stop it and confirm a time entry is recorded against B.

**Acceptance Scenarios**:

1. **Given** a work item I can access, **When** I start a timer on it, **Then** a timer begins accruing live and is shown as running on that item.
2. **Given** a timer running on item A, **When** I start a timer on item B, **Then** A's timer stops (its elapsed time is recorded) and B's timer starts — at most one active timer per user.
3. **Given** a running timer, **When** I reload the page or the server restarts, **Then** the timer is still running with the correct elapsed time (server-side source of truth).
4. **Given** a running timer, **When** I stop it, **Then** a time entry is created against that item with the elapsed duration, **source = timer**, and attributed to me.

---

### User Story 2 - See plan-vs-actual at a glance — the signature time meter (Priority: P1)

As anyone looking at the board or a list, I can see, **inside the task row**, how much time has been logged against an item versus its estimate — a meter that fills as time accrues and **turns red when it goes over budget** — so the team can tell honest progress from optimism without opening anything.

**Why this priority**: This is the **signature visual move** of the whole product (the `branding/` bundle calls it out by name) and the visible promise of D1. It is what makes the time data *felt*, not just stored.

**Independent Test**: On an item with an estimate, log time below the estimate and confirm the in-row meter partially fills against the planned tick; log time beyond the estimate and confirm the meter renders the over-budget state (red); confirm an item with no estimate shows logged time without implying over/under budget.

**Acceptance Scenarios**:

1. **Given** an item with an estimate and some logged time under it, **When** I view it on the Board or List, **Then** the row shows a plan-vs-actual meter filled proportionally toward the planned tick, with figures in tabular numerals.
2. **Given** an item whose logged time exceeds its estimate, **When** I view it, **Then** the meter shows the **over-budget** state (red) and the amount over.
3. **Given** an item with **no** estimate, **When** I view it, **Then** logged time is shown without an over/under-budget judgement (no false "over budget").
4. **Given** I am viewing the item detail, **When** I open it, **Then** I see total logged vs estimate, the list of entries, and the timer control.

---

### User Story 3 - Log time manually, after the fact (Priority: P1)

As a teammate who forgot to run a timer (or did the work away from the app), I add a manual time entry to an item — a duration (or start/end), the date, and an optional note — and it sums into the item's totals exactly as a timer-tracked entry would.

**Why this priority**: Real teams forget timers; without manual entry the time data is incomplete and therefore untrustworthy. Pairs with US1 to make capture-of-time complete.

**Independent Test**: Add a manual entry of "2h yesterday, note: pairing" to an item with no prior time; confirm the item's total is 2h, the entry shows date/note/duration and **source = manual**, and it appears in aggregations.

**Acceptance Scenarios**:

1. **Given** a work item, **When** I add a manual entry with a duration, a date, and an optional note, **Then** the entry persists with **source = manual**, attributed to me, and sums into the item total.
2. **Given** I prefer start/end, **When** I enter a start and end time, **Then** the duration is derived and stored consistently with duration-based entries.
3. **Given** I mark an entry **billable**, **When** I save it, **Then** the billable flag is recorded on the entry (rates/cost are out of scope — flag only).

---

### User Story 4 - Correct and audit time entries (Priority: P2)

As the owner of a time entry, I can edit or delete my own entries; as an admin, I can correct a teammate's entry when something is clearly wrong; and **every** such change is audited so the numbers stay trustworthy.

**Why this priority**: Editability is required for the data to be honest (people fat-finger durations), but the happy path of tracking (US1–US3) can be demonstrated before correction/audit is complete — hence P2.

**Independent Test**: Edit the duration of your own entry and confirm the change persists and is recorded in the audit trail; as an admin, correct another user's entry and confirm it is permitted and audited; as a non-owner non-admin, attempt to edit someone else's entry and confirm it is denied.

**Acceptance Scenarios**:

1. **Given** a time entry I own, **When** I edit its duration/date/note or delete it, **Then** the change is applied and recorded in the entry's audit history.
2. **Given** I am an admin, **When** I correct another user's entry per permission, **Then** the change is permitted and audited with who changed what.
3. **Given** I am neither the owner nor an admin, **When** I try to edit another user's entry, **Then** the action is denied server-side (default-deny) and nothing changes.

---

### User Story 5 - Tell planned work from interruptions (Priority: P2)

As anyone tracking time, I want each entry classified as **planned** or **interruption/urgent** — derived from the item's priority/label (e.g. an Urgent item counts as an interruption) or set explicitly — so the data can later prove how much of the week was shredded by ad-hoc work versus the roadmap.

**Why this priority**: The planned-vs-interruption split is the unique insight D1 promises and what makes the M4 report meaningful, but it rides on top of entries existing (US1–US3) — so it is P2, not P1.

**Independent Test**: Log time on an Urgent item and confirm the time is classified as an interruption; log time on a normal roadmap item and confirm it is classified as planned; override the classification on an entry and confirm the override sticks; confirm the planned/interruption totals sum to the overall total.

**Acceptance Scenarios**:

1. **Given** an entry on an Urgent (or interruption-labelled) item, **When** it is recorded, **Then** it is classified **interruption** by default.
2. **Given** an entry on a non-urgent roadmap item, **When** it is recorded, **Then** it is classified **planned** by default.
3. **Given** an entry whose default classification is wrong, **When** I override it, **Then** the override is stored and used in aggregations.
4. **Given** any item or period, **When** I view its planned and interruption time, **Then** the two sum exactly to the total logged.

---

### User Story 6 - Time tracking, woven into the product I already use (Priority: P2)

As an existing user of the M0→M3 product, I want time tracking to feel native, not bolted on: timer/entry events appear in an item's **activity feed** alongside its other history, the item's **source** (web/Slack/agent) and each entry's **source** read consistently, and nothing about the screens I already use breaks. This is the *finalize* half — M2 closing the loop on the M0→M3 slice.

**Why this priority**: Integration is what turns "a time feature" into "the product is whole". It is valuable and expected, but the core tracking (US1–US3) can be shown before every surface is wired — hence P2.

**Independent Test**: Track time on an item that was captured from Slack, then open that item's activity feed and confirm the timer/log events appear in order; confirm the item still shows its capture source (Slack) and the time entry shows its own source (timer); confirm the Board/List/detail screens shipped in 003 still work unchanged apart from the new meter.

**Acceptance Scenarios**:

1. **Given** time is logged on an item (via timer or manual), **When** I open its activity feed, **Then** the time events appear as activity entries with who/when, interleaved with existing item history.
2. **Given** an item captured from Slack or by an agent (M3), **When** I track time on it from the web, **Then** the item retains its **capture source** and the time entry records its **own source** (timer/manual) — the two provenances are distinct and both correct.
3. **Given** the 003 web surfaces (Board, List, item detail, My Work), **When** M2 ships, **Then** they continue to function, now augmented with the time meter and timer/entry controls, with no regression.

---

### User Story 7 - See my time add up (aggregations) (Priority: P3)

As a teammate or lead, I can see time totals roll up — per item, per project, and per period (e.g. "my time today / this week") — and the totals always reconcile exactly with the underlying entries.

**Why this priority**: Aggregations make the data useful day-to-day and are the API the future M4 reports will consume, but they are downstream of entries existing and are not the demoable centerpiece — hence P3. The full weekly **Time/Interruption Report** and the editable **timesheet grid** are explicitly later milestones.

**Independent Test**: Log known entries across two items in one project on two days; query the per-item, per-project, and per-period totals and confirm each equals the exact sum of the contributing entries; change an entry and confirm every aggregation updates consistently.

**Acceptance Scenarios**:

1. **Given** entries across items/projects/days, **When** I request totals per item, per project, and per period, **Then** each total equals the exact sum of its contributing entries.
2. **Given** I view "my time this week", **When** entries change, **Then** the displayed totals update to remain consistent with the entries.
3. **Given** aggregation parameters (item/project/user/period), **When** I request them via the API, **Then** the same totals are returned as shown in the UI.

---

### User Story 8 - Trustworthy, tenant-safe, permission-scoped time (Priority: P3)

As a self-hoster, I need time tracking to honor the same guarantees as the rest of the product: a user can never see or alter another tenant's time data; only permitted users can edit others' entries; and timer/entry operations are safe to retry without double-counting.

**Why this priority**: Essential for production trust, but the functional stories can be demonstrated first; this hardens them.

**Independent Test**: Attempt to read or edit another organization's time entries and confirm it is impossible; attempt to edit another user's entry without permission and confirm denial; submit the same start/stop or log operation twice and confirm no duplicate or double-counted time.

**Acceptance Scenarios**:

1. **Given** a user in org A, **When** they attempt to access org B's timers or entries by any path, **Then** the access is denied and nothing is returned (tenant isolation).
2. **Given** a user without permission, **When** they attempt to edit/delete another user's entry, **Then** the action is denied server-side (default-deny).
3. **Given** a duplicated timer-stop or log request (a retry), **When** both are processed, **Then** exactly one entry results / the time is counted once (idempotent and replay-safe).
4. **Given** a timer is already running for me, **When** a second "start" is submitted concurrently, **Then** the one-active-timer-per-user invariant still holds (no two active timers).

---

### Edge Cases

- **Timer left running for a very long time / overnight**: the timer keeps accruing (idle detection and reminders are `FR-TT-008`, v3); the entry records the full span and can be corrected (US4).
- **Start a timer on an item, then lose access** (removed from the project) while it runs: the running timer is handled safely (stopped/closed); accrued time is not silently lost.
- **Manual entry with end before start, zero/negative duration, or absurdly long duration**: rejected with a clear validation message; nothing persisted.
- **Logging time against an item with no estimate**: allowed; the meter shows logged time without an over/under-budget judgement (no false "over budget").
- **Editing an entry that changes a planned/interruption classification or a project**: aggregations recompute consistently; the change is audited.
- **Deleting an item that has time entries**: defined behavior (entries are handled with the item per the data-retention rule), and aggregations stop counting the removed time.
- **Concurrent stop + edit of the same entry**: resolved without double-counting or lost updates.
- **Two browser tabs both showing my timer**: both reflect the single server-side timer state (no divergence; the server is authoritative).
- **Reopening a completed item and tracking more time**: permitted; totals and the meter update.

## Requirements *(mandatory)*

Requirements reuse the canonical backend IDs (`FR-TT-*`) as their authority and add an M2-scoped web family (`FR-WEB-2xx`), a finalization family (`FR-FIN-*`), and cross-cutting constraints (`FR-X-*`), each traced in **Traceability**. All items are MVP-stage `Must` unless noted. The server is the sole authority; client role-gating is cosmetic.

### Time tracking — timer

- **FR-TT-001**: The system MUST provide a **start/stop timer** on any work item, enforcing **at most one active timer per user** (starting a timer while another runs stops the first); elapsed time accrues live. *(canonical FR-TT-001)*
- **FR-TT-009**: Timers MUST **persist server-side** and remain accurate across page reload and server restart (the server, not the client, is the source of truth). *(canonical FR-TT-009)*

### Time tracking — manual entries & fields

- **FR-TT-002**: The system MUST support **manual time entries** specified as a duration **or** a start/end, with a date and an optional note; manual entries sum into totals identically to timer entries. *(canonical FR-TT-002)*
- **FR-TT-004**: Each time entry MUST capture: **user, work item, project, start, end/duration, note, billable flag, and source** (`timer` / `manual` / `slack` / `mcp` / `api`). For M2, entries originate from `timer` and `manual`; the remaining source values exist for forward-compatibility with the v2 Slack/MCP time channels. *(canonical FR-TT-004; source vocabulary shared with M3 `work_items.source`)*

### Time tracking — edit, delete & audit

- **FR-TT-003**: Time entries MUST be **editable and deletable by their owner**, and **correctable by admins** per permission, with every change **audited** (who changed what, when). Non-owners without permission MUST be denied (default-deny). *(canonical FR-TT-003)*

### Time tracking — aggregation

- **FR-TT-005**: The system MUST **aggregate time** per item, per user, per project, and per time period, with every aggregation reconciling exactly to the sum of its contributing entries. (Per-cycle and per-label aggregation degrade gracefully until cycles/labels-on-time ship; per-label rollup rides on M1 labels.) *(canonical FR-TT-005)*

### Time tracking — planned vs interruption

- **FR-TT-006**: The system MUST classify each entry as **planned** or **interruption/urgent**, derived by default from the item's priority/label (e.g. Urgent ⇒ interruption) and **overridable explicitly**; planned and interruption time MUST sum to the total. *(canonical FR-TT-006)*

### Frontend — the signature meter & time UI

- **FR-WEB-201**: The web app MUST render the **plan-vs-actual time meter inside the task row** on the Board and List views — a fill that progresses toward the estimate's planned tick and renders an **over-budget (red)** state when logged time exceeds the estimate; items without an estimate show logged time without an over/under judgement. Figures use tabular numerals per the design system. *(surfaces FR-TT-005; branding signature move)*
- **FR-WEB-202**: The item detail surface MUST provide **timer controls** (start/stop) and show **total logged vs estimate**, the **list of time entries** (with source, user, date, note, billable, classification), and controls to **add / edit / delete** entries per permission. *(surfaces FR-TT-001/002/003/004)*
- **FR-WEB-203**: The web app MUST provide a **"my time"** view (e.g. today / this week) showing the signed-in user's logged time and totals, reconciling with the underlying entries. *(surfaces FR-TT-005; the full editable timesheet grid `FR-TT-007` and weekly report `FR-RPT-*` are out of scope)*
- **FR-WEB-204**: The web app MUST present time data in a way that passes the **Albert/Marissa test** — a non-technical teammate can start/stop a timer and read the meter with no training and no jargon.

### Finalize M0→M3 — integration

- **FR-FIN-001**: Time events (timer started/stopped, time logged, entry edited/deleted) MUST appear in the item's existing **activity feed** (M1), interleaved with other item history, attributed and timestamped.
- **FR-FIN-002**: A time entry's **source** and a work item's **capture source** (M3 `work_items.source`) MUST be distinct, both correct, and read consistently across the UI — tracking time on a Slack-captured item does not alter the item's capture source.
- **FR-FIN-003**: Introducing M2 MUST NOT regress the M0→M3 surfaces or contracts: the 003 web surfaces (Board, List, item detail, My Work, settings) continue to function; M1/M3 contracts (`users.organizationId`, `project_members`, `TenantScopedRepository`, the 49-tool MCP registry) are unchanged.
- **FR-FIN-004**: The **MCP parity surface MUST stay at 49/49** — time-tracking service use cases are recorded as a **documented v2 deferral** in the parity-exclusion list (the same mechanism M3 used), so `check-mcp-parity` stays green without adding time tools this milestone. *(time control via MCP/Slack is `FR-TT-010`/`FR-INT-MCP-008`, v2 — see Out of Scope)*
- **FR-FIN-005**: All existing CI gates MUST remain green with M2 added — lint, unit, integration (against real Postgres), required-tests, module boundaries, MCP parity (49/49), and design-token conformance — and M2's own required tests (below) MUST be present and passing.

### Cross-cutting constraints

- **FR-X-001**: All new time-tracking read/write paths MUST be **multi-tenant by construction** (org/workspace-scoped via `TenantScopedRepository`, default-deny) and enforce RBAC server-side identically to the rest of the product; no raw unscoped data access. *(NFR-SEC-003, NFR-MT-002, FR-TEN-001)*
- **FR-X-002**: New capability MUST ship under the project's **closed-testing policy**: every new provider has ≥1 integration test (real Postgres); every new route a contract test; every domain policy/validator (one-active-timer, classification, edit-permission, duration validation) a unit test; the timer lifecycle an integration test (start → stop → entry created, idempotent on replay); and a **tenant-isolation test** proving no cross-tenant access to timers/entries. *(FR-TEST-001…007, FR-TEST-010)*
- **FR-X-003**: All new web UI MUST conform to the brand/design system (Principle VIII): tokens flow `branding/colors_and_type.css → packages/ui → apps/web`, referenced only as semantic `var(--*)`; the time meter uses the honey/over-budget-red semantics and Geist-Mono tabular numerals; passes the token-conformance and web-closed-testing gates. *(NFR-WEB-001, NFR-WEB-006)*
- **FR-X-004**: Time-tracking write operations (timer stop, log) MUST be **idempotent / replay-safe** so a retried request never double-counts time. *(architecture invariant: idempotent & replay-safe)*

## Key Entities *(include if feature involves data)*

- **Timer**: a user's single in-progress time accrual against one work item — at most one active per user, server-persisted (survives reload/restart), resolvable to a time entry when stopped. New in M2.
- **Time Entry (time log)**: a recorded span of work against a work item — carries user, work item, project, start, end/duration, note, **billable** flag, **source** (`timer`/`manual`/`slack`/`mcp`/`api`), and a **planned-vs-interruption** classification; editable/deletable with audit; the atomic unit all aggregations sum. New in M2.
- **Time Entry Audit**: the trail of who changed/deleted an entry and when, so corrected numbers stay trustworthy. New in M2 (may reuse the existing activity/audit mechanism).
- **Estimate (existing, M1)**: the work item's planned time, against which logged time is compared for the plan-vs-actual meter and over-budget state. **Reused, not new.**
- **Capture Source (existing, M3)**: the work item's origin (`web`/`slack`/`mcp`/`api`); distinct from a time entry's own source. **Reused, not new.**
- **Time Aggregation (read-model concept)**: totals rolled up per item/user/project/period and split planned vs interruption; a query result, not a separately persisted entity for M2 (materialized report rollups are M4).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can **start or stop a timer in ≤2 seconds and one action**, and the timer survives a page reload and a server restart with the correct elapsed time (server-side source of truth).
- **SC-002**: The **one-active-timer-per-user** invariant holds **100%** of the time — no sequence of starts/stops (including concurrent) ever yields two active timers for one user.
- **SC-003**: Every work item **with an estimate** shows an in-row **plan-vs-actual meter**, and **100%** of over-budget items render the over-budget (red) state; items without an estimate never show a false over-budget judgement.
- **SC-004**: A user can **record a manual time entry in ≤30 seconds**, and manual and timer entries are indistinguishable in how they sum into totals.
- **SC-005**: **Every** aggregation (per item, per user, per project, per period, and the planned/interruption split) **reconciles exactly** to the sum of its contributing entries — verified by automated tests across all groupings.
- **SC-006**: **100%** of cross-tenant access attempts to timers/time entries are denied (zero leakage), and **100%** of unauthorized attempts to edit another user's entry are denied — asserted by automated tests.
- **SC-007**: Every time-entry change is **audited**, and **100%** of timer-stop/log retries result in time counted exactly once (no double-count).
- **SC-008**: With M2 merged, **all M0→M3 CI gates stay green** — including **MCP parity at 49/49** and design-token conformance — and the 003 web surfaces show **no regression** (the milestone sequence M0→M3 is finalized).
- **SC-009**: A non-technical teammate can **start a timer, read the meter, and log time** with no training and no jargon (Albert/Marissa test).

## Assumptions

- **M2 scope follows the milestone map** (`knowledge/REQUIREMENTS.md`, `knowledge/BRD.md` §9, `knowledge/BUILD-PLAYBOOK.md`): the MVP `Must` subset `FR-TT-001…006` + `FR-TT-009`, delivered as **web + REST API**, plus the integration/finalization work. The decision recorded for this spec is **"integrate into shipped surfaces, no pull-forward"**.
- **M2 builds on complete, stable M0, M1, the 003 web app, and M3.** It reuses M1's **work items, projects, estimates, statuses, priorities, labels, activity feed**; M0's **tenancy/RBAC spine** (`TenantScopedRepository`, roles); and M3's **`work_items.source`** provenance. It must not break those contracts.
- **Time tracking is a new bounded module** (`apps/api/src/modules/time-tracking`) that calls other modules only via their `*.contract.ts` — never reaching into another module's tables — consistent with the project's hard module-boundary invariant. New tables (`timers`, `time_logs`) follow the multi-tenant table rules (`organizationId NOT NULL`, tenant-leading composite indexes) already specified in `knowledge/ARCHITECTURE.md`.
- **"Track" here means time tracking** — the complement of M3, where "track" meant work-item tracking. The two are deliberately distinct.
- **Source vocabulary is shared:** the time-entry `source` enum (`timer`/`manual`/`slack`/`mcp`/`api`) and the M3 work-item capture source use the same vocabulary; for M2 only `timer` and `manual` are produced, with `slack`/`mcp`/`api` reserved for the v2 channels.
- **Estimate-vs-actual in the meter is the visual logged-vs-estimate comparison** (the signature row meter). The formal **estimate-vs-actual variance feeding reports** (`FR-TT-012`, v2) and full reporting (`FR-RPT-*`, M4) are out of scope; M2 exposes the aggregation API those later features will consume.
- **Billable is a boolean flag only** (`FR-TT-004`); **rates, cost, and billing reports** (`FR-TT-013`) are v3 and out of scope.
- **Planned-vs-interruption defaults are derived from item priority/label** (e.g. Urgent ⇒ interruption) with an explicit per-entry override; the precise default rule is a design detail to settle in planning, but the split MUST always sum to the total.
- **Brand fidelity (Principle VIII)** governs all new web UI; the meter uses the honey-fill / over-budget-red semantics and Geist-Mono tabular numerals; tokens are referenced only as semantic `var(--*)`.
- Standard operational defaults apply where unspecified: friendly validation messages with safe fallbacks; the server remains the sole authority and client role-gating is cosmetic; time operations are idempotent and replay-safe.

## Out of Scope (deferred to later milestones)

- **Slack/MCP/API time control** — start/stop/log time from Slack (`FR-INT-SLACK-010`) and from MCP/public API with source attribution (`FR-TT-010`, `FR-INT-MCP-008`): **v2**. The MCP parity surface therefore **stays at 49/49** this milestone (FR-FIN-004); no time tools are added.
- **Reporting (M4)** — the **Time Report** and **Interruption Report** (planned-vs-interruption split by week, exportable) and the **personal weekly summary** (`FR-RPT-001/002/007`): milestone **M4**. M2 provides the aggregation capability they will consume, not the reports themselves.
- **Editable weekly timesheet grid** (`FR-TT-007`, v2).
- **Idle detection / timer reminders** (`FR-TT-008`, v3).
- **Time rounding rules / minimum increments** (`FR-TT-011`, v3).
- **Estimate-vs-actual variance feeding reports** (`FR-TT-012`, v2) beyond the visual in-row meter.
- **Billable rates, cost, and billing reports** (`FR-TT-013`, v3) — M2 records only the billable flag.
- **Agile charts and dashboards** (`FR-RPT-003…006/008…010`, v2/v3).
- **Per-cycle aggregation** depends on cycles, which are not yet built; M2's aggregation covers item/user/project/period (+ label, riding on M1 labels) and ships cycle rollup with the cycles milestone.

## Traceability

| M2 requirement | User story | Canonical source requirement |
|---|---|---|
| FR-TT-001 (start/stop timer; one active/user) | US1 | FR-TT-001 |
| FR-TT-009 (server-persisted timers) | US1 | FR-TT-009 |
| FR-TT-002 (manual entries) | US3 | FR-TT-002 |
| FR-TT-004 (entry fields incl. billable + source) | US3 | FR-TT-004 |
| FR-TT-003 (edit/delete + audit; admin correct) | US4 | FR-TT-003 |
| FR-TT-005 (aggregation per item/user/project/period) | US7 | FR-TT-005 |
| FR-TT-006 (planned vs interruption) | US5 | FR-TT-006 |
| FR-WEB-201 (in-row plan-vs-actual meter) | US2 | FR-TT-005; branding signature move |
| FR-WEB-202 (item-detail timer + entry CRUD) | US1, US3, US4 | FR-TT-001/002/003/004 |
| FR-WEB-203 ("my time" view) | US7 | FR-TT-005 |
| FR-WEB-204 (Albert/Marissa-test time UI) | US2, US6 | NFR-WEB / Albert-Marissa test |
| FR-FIN-001 (time events in activity feed) | US6 | M1 activity; FR-TT-003 (audit) |
| FR-FIN-002 (entry source vs capture source) | US6 | FR-TT-004; M3 work_items.source |
| FR-FIN-003 (no regression to M0→M3 surfaces/contracts) | US6 | M1/M3 contracts |
| FR-FIN-004 (MCP parity stays 49/49; time = v2 deferral) | US6 | FR-INT-MCP-009 (parity gate, v2); FR-TT-010 (v2) |
| FR-FIN-005 (all M0→M3 CI gates green) | US6, US8 | FR-TEST-001…010 |
| FR-X-001 (tenant/RBAC by construction) | US8 | NFR-SEC-003, NFR-MT-002, FR-TEN-001 |
| FR-X-002 (closed testing for time paths) | all | FR-TEST-001…007, FR-TEST-010 |
| FR-X-003 (brand/design-system fidelity) | US2 | NFR-WEB-001, NFR-WEB-006 |
| FR-X-004 (idempotent/replay-safe time writes) | US8 | architecture invariant |
