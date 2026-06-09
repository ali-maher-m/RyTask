# Implementation Plan: Time Tracking (the flagship) — and finalizing M0→M3 (Milestone M2)

**Branch**: `005-time-tracking-flagship` | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-time-tracking-flagship/spec.md`

## Summary

M2 makes the *tracked* half of the North-Star metric real — a **live, server-persisted start/stop
timer** on any work item, **manual time entries**, **edit/delete with audit**, **planned-vs-interruption
tagging**, **aggregations**, and the product's **signature in-row plan-vs-actual time meter** — the thing
every competitor either paywalls or omits (D1/D6). It is also the *finalize* milestone: time tracking is
woven into the surfaces M0/M1/003/M3 already shipped (the M1 activity feed, the 003 Board/List/detail/My
Work, the M3 `work_items.source` provenance) so the four shipped milestones cohere into one shippable
Stage-1 product, with **every M0→M3 CI gate kept green** and **MCP parity held at 49/49**.

No fixed-stack change and no new external dependency. The technical approach follows the codebase's
established seams. **Time tracking becomes a new bounded module** (`apps/api/src/modules/time-tracking`)
that mirrors the `work-items` module structure verbatim (controllers → providers-per-operation →
`TenantScopedRepository` → domain policies → `module.testplan.ts`) and calls other modules **only through
their `*.contract.ts`**. It owns exactly **two new tables** — `timers` (the single in-progress accrual per
user) and `time_logs` (finalized entries) — plus two new enums. The **one-active-timer-per-user**
invariant is a database `UNIQUE(organization_id, user_id)` on `timers`, not application discipline;
**server time is the source of truth** via the existing `CLOCK` port, so a timer survives reload and
restart because the client computes elapsed from the server's `startedAt` (no realtime fan-out needed —
the M1 realtime seam stays deferred). **Audit and the activity feed reuse the M1 mechanism**: the
time-tracking module appends `TIME_*` events through a small extension of the **work-items contract**
(`recordTime*`), exactly as the `comments` module appends `COMMENTED` today — so no new audit table and no
boundary violation. **RBAC reuses the existing `work:read`/`work:write` permissions** (time access ==
work-item access), with **owner-or-admin** edit/delete enforced default-deny in the provider — leaving the
M0 role matrix and PAT scopes untouched. Writes are **idempotent/replay-safe** via the existing
`IdempotencyService`. The **MCP tool surface does not grow** (49/49): time-control-via-MCP is a documented
v2 deferral recorded the same way M3 recorded credential-flow exclusions — by *omission* from
`serviceCapabilities` plus a comment, since there is no separate exclusion list to edit.

On the web, the **signature meter** is a new token-only `<Meter>` primitive in `packages/ui` built from
the **already-defined** time tokens (`--time-actual` honey fill, `--time-over` red, `--time-plan` tick,
`--time-track-bg`) — no new tokens — rendered inside the Board/List rows and on item detail, with timer
controls, a time-entries list, and a "my time today/this week" view. Because work-items must not read
`time_logs`, the row meter's per-item totals come from a **parallel time-rollup fetch** merged
client-side, not from a join inside work-items.

Decisions are recorded in [research.md](./research.md) (D1–D17); the persisted model in
[data-model.md](./data-model.md); the REST, time-flow, web-surface, and activity/source contracts in
[contracts/](./contracts/); run/seed/verify and the CI gates in [quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, `noUncheckedIndexedAccess`), Node 20+. Backend NestJS
(modular monolith); frontend Next.js 15 (App Router, RSC), React 19. No new language or runtime.

**Primary Dependencies**: Existing only — NestJS, Drizzle ORM over PostgreSQL 16, Redis 7 + BullMQ,
`@rytask/contracts` (single contract source), `@rytask/ui` (token-driven components), the M0 RBAC/PAT
stack (`common/rbac`, `common/guards`), `TenantScopedRepository` + `TenantContextService`
(AsyncLocalStorage), the `CLOCK` and `ID_GENERATOR` ports (`common/ports`), the `IdempotencyService`
(`common/idempotency`), the M1 `activity` table + `ActivityRepository` (reached via the work-items
contract), and `@nestjs/event-emitter` (already wired). **No new npm dependency** — time tracking invents
no business capability that needs a library; it is the same domain/tenancy/RBAC spine applied to a new
entity. Web reuses the existing fetch/`authedRequest` clients, local-state pattern, `lucide-react`, and
CSS Modules + semantic `var(--*)`.

**Storage**: PostgreSQL 16 via Drizzle (`packages/db/src/tables.ts` is the source of truth). New: two
tenant-scoped tables `timers` and `time_logs` (`organization_id` `NOT NULL`, org-leading composite
indexes, repositories extend `TenantScopedRepository`) and two new enums `timeEntrySourceEnum`
(`TIMER`/`MANUAL`/`SLACK`/`MCP`/`API`) and `timeEntryClassEnum` (`PLANNED`/`INTERRUPTION`). The M1
`activityActionEnum` gains five values (`TIME_STARTED`/`TIME_STOPPED`/`TIME_LOGGED`/`TIME_EDITED`/
`TIME_DELETED`) so time events live in the existing `activity` feed (no new audit table). `timers` carries
`UNIQUE(organization_id, user_id)` (the one-active-timer invariant). Durations are stored as
**`duration_seconds` integer** (exact; no float drift); the M1 `work_items.estimate_value` is **reused**
(interpreted as hours for the meter) and **untouched**; `work_items.source` (capture source) is reused and
untouched. One generated migration (`packages/db/migrations/000N_*.sql`).

**Testing**: Vitest (unit + integration against **real PostgreSQL** via testcontainers), supertest
(contract), Playwright + `@axe-core/playwright` (web e2e + a11y). A new
`apps/api/src/modules/time-tracking/module.testplan.ts` declares required tests; the existing
`scripts/check-required-tests.ts` fails the build on any missing one. Required coverage: every provider →
≥1 integration test (real Postgres); every route → a contract test; every domain policy
(one-active-timer, classification-derivation, edit-permission/ownership, duration-validation) → a unit
test; the timer lifecycle → an integration test (start → stop → `time_log` created, idempotent on replay);
a **tenant-isolation test** for both `timers` and `time_logs`; an aggregation reconciliation test across
every grouping. Web adds Playwright e2e for the timer + meter + manual log to `apps/web/web.testplan.ts`.
`module.testplan.ts` declares `mcpTools: []` (no time tools this milestone).

**Target Platform**: Linux server (Docker), one image for `api`/`worker` (no new entrypoint — there is no
time queue; all time writes are synchronous request-path work). Web targets modern evergreen browsers.

**Project Type**: Full-stack web application — a new backend bounded module + REST surface **and** web
surfaces (the in-row meter, item-detail timer/entries, a "my time" view), extending the existing monorepo.

**Performance Goals**: Start/stop a timer in **≤2 s and one action** (SC-001); record a manual entry in
**≤30 s** (SC-004). Timer start/stop and manual log complete server-side **≤300 ms p95** (consistent with
M1 write budgets). The Board/List render the per-row meter from a single parallel rollup fetch (no N+1).
Aggregations are tenant-scoped `SUM(duration_seconds) … GROUP BY` queries over org-leading composite
indexes.

**Constraints**: Multi-tenant by construction — every timer/log read/write goes through
`TenantScopedRepository`; the tenant is resolved server-side from the principal and **never**
client-supplied; cross-tenant access is impossible and asserted by tests (FR-X-001, SC-006). The server is
the sole authority (the client never holds timer truth); client role-gating is cosmetic. The
one-active-timer invariant holds 100% under concurrency (DB unique constraint, SC-002). Edit/delete of
another user's entry is denied server-side unless admin (default-deny, SC-006). Timer-stop/log retries
never double-count (idempotent, SC-007). New web UI is token-only brand-conformant (Principle VIII,
honey-fill/over-budget-red/tabular-nums) and passes `check-design-tokens`. No new secret is introduced.

**Scale/Scope**: One new backend bounded module (2 tables, 2 enums, +5 activity-action values, ~6 REST
routes: timer start/stop/active, time-logs create/list/update/delete, rollup, summary); a 5-method
extension of the work-items contract for the activity feed; one new `packages/ui` `<Meter>` primitive; 4
web surfaces touched (Board row, List row, item detail, My Work / "my time"); **0** new MCP tools (parity
stays 49/49); 8 user stories (P1×3, P2×3, P3×2).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

- [x] **I. Fixed Technology Stack** — NestJS modular monolith + Next.js + Drizzle/Postgres + Redis/BullMQ,
      unchanged. **No new dependency** of any kind — time tracking reuses the existing domain/tenancy/RBAC/
      ports spine. No framework, ORM, DB, queue, or tooling is substituted. **PASS.**
- [x] **II. Multi-Tenancy by Construction** — `timers` and `time_logs` carry `organization_id`
      (`workspace_id` where relevant) `NOT NULL` with `organization_id`-leading composite indexes; their
      repositories extend `TenantScopedRepository` (auto-`WHERE organization_id = :orgId`). The active
      tenant is resolved server-side from the principal (AsyncLocalStorage), never from a client field.
      Aggregations are tenant-scoped SUMs. Cross-tenant isolation for both tables is asserted by dedicated
      tenancy tests (FR-X-001, SC-006). **PASS.**
- [x] **III. Modular Monolith & Hexagonal Architecture** — Time tracking is a new bounded module exposing
      its own contract; it **never** reaches into another module's tables. It calls the work-items module
      only via `work-items.contract.ts` — to verify item access and to append `TIME_*` activity through new
      `recordTime*` methods (the exact pattern `comments` uses for `recordCommented`). Provider-per-
      operation. All external I/O behind ports (`CLOCK`, `ID_GENERATOR`, `DB`, Redis idempotency).
      `dependency-cruiser` enforces the boundary; the contract file is the only exempt cross-module import.
      **PASS.**
- [⚠] **IV. API ↔ MCP Parity** — M2 adds **no** MCP tools; the enforced parity gate
      (`check-mcp-parity.ts`) stays **green at 49/49**. Per the spec's locked "no pull-forward" scope
      (FR-FIN-004, Out of Scope), time-*control* via MCP/Slack is **v2** (`FR-TT-010`/`FR-INT-MCP-008`).
      The deferral is recorded exactly as M3 recorded its credential-flow exclusions: time-tracking
      capabilities are **omitted** from `serviceCapabilities` and a comment documents why — there is no
      separate exclusion list to maintain, so omission + comment *is* the mechanism. See Complexity
      Tracking. **PASS with tracked, spec-authorized deferral.**
- [x] **V. Test-First & Enforced Coverage (NON-NEGOTIABLE)** — A new
      `time-tracking/module.testplan.ts` declares required tests; `check-required-tests.ts` fails on any
      absence. Every provider → integration test (real Postgres); every route → contract test; every domain
      policy → unit test; the timer lifecycle → integration test (start → stop → log, idempotent replay);
      tenant-isolation tests for `timers` and `time_logs`; an aggregation reconciliation test; Playwright
      e2e for the timer + meter + manual-log flow added to `web.testplan.ts`. **PASS.**
- [x] **VI. Secure by Default** — Every time route carries a server-side RBAC guard
      (`@RequirePermission('work:read'|'work:write')`); authorization is decided server-side from the
      principal + resolved tenant. Edit/delete of another user's entry is **default-deny** in the provider
      unless `principal.isOrgAdmin`. No new secret. Writes are idempotent/replay-safe. **PASS.**
- [x] **VII. One-Command Self-Hosting** — No new service and **no new entrypoint** (time writes are
      synchronous request-path work; no BullMQ queue added). `docker compose up` stands the same stack up;
      `make seed` adds demo timers/logs. No manual undocumented step. **PASS.**
- [x] **VIII. Design System & Brand Fidelity** — The new `<Meter>` primitive and all time UI use **only**
      semantic `var(--*)` tokens — the **already-defined** time tokens (`--time-actual` honey fill,
      `--time-over` red over-budget, `--time-plan` planned tick, `--time-track-bg` track) and Geist-Mono
      `tabular-nums` figures via the existing `<Figure>` — so **no new token** is introduced. Flat
      aesthetic, WCAG AA contrast, sentence-case jargon-free copy ("Start timer", "2h 15m logged of 8h"),
      passes the Albert/Marissa test (FR-WEB-204, SC-009). CI-enforced by `check-design-tokens.ts`. **PASS.**

**Result: all gates PASS, with one tracked, spec-authorized parity deferral (Principle IV) recorded in
Complexity Tracking. No other Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/005-time-tracking-flagship/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — decisions D1–D17 (no open NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 — NEW entities (2 tables, 2 enums, +5 activity actions) + read-models
├── quickstart.md        # Phase 1 — run/seed/verify each US + the CI gates
├── contracts/           # Phase 1 — REST, time-flow, web-surface, activity/source contracts
│   ├── README.md
│   ├── time-rest.md            # timer start/stop/active, time-logs CRUD, rollup, summary (REST + DTOs)
│   ├── time-tracking-flow.md   # timer lifecycle, one-active invariant, idempotency, classification
│   ├── web-surfaces.md         # <Meter> + row meter + item-detail time section + "my time" + gating
│   └── activity-and-source.md  # TIME_* activity feed integration + entry-source vs capture-source
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/
├── modules/
│   └── time-tracking/                         # NEW bounded module (Principle III) — mirrors work-items
│       ├── time-tracking.module.ts
│       ├── time-tracking.contract.ts          # public port + token (TIME_TRACKING_ACCESS) for rollups
│       ├── module.testplan.ts                 # required-tests declaration; mcpTools: [] (Principle V/IV)
│       ├── controllers/
│       │   ├── timers.controller.ts                  # POST start, POST :id/stop, GET active (RBAC)
│       │   ├── time-logs.controller.ts               # POST/GET/PATCH/DELETE under /work-items/:id… + /time
│       │   ├── time-summary.controller.ts            # GET /time/summary, GET /time/rollup
│       │   └── *.controller.contract.spec.ts
│       ├── providers/                                # provider-per-operation
│       │   ├── start-timer.provider.ts               # stop-current-then-start in one TX (invariant)
│       │   ├── stop-timer.provider.ts                # finalize timer → time_log (idempotent)
│       │   ├── get-active-timer.provider.ts
│       │   ├── create-time-log.provider.ts           # manual entry (duration | start/end)
│       │   ├── update-time-log.provider.ts           # owner-or-admin; audited via activity
│       │   ├── delete-time-log.provider.ts           # owner-or-admin; audited via activity
│       │   ├── list-time-logs.provider.ts
│       │   ├── time-rollup.provider.ts               # per-item totals for the row meter (read-model)
│       │   ├── time-summary.provider.ts              # per item/user/project/period + planned/interrupt
│       │   └── *.provider.int.spec.ts
│       ├── repositories/
│       │   ├── timers.repository.ts                  # extends TenantScopedRepository
│       │   ├── time-logs.repository.ts               # extends TenantScopedRepository
│       │   ├── timers.tenancy.spec.ts
│       │   └── time-logs.tenancy.spec.ts
│       ├── domain/                                   # pure policies (unit-tested)
│       │   ├── one-active-timer.policy.ts            # at-most-one; stop-then-start resolution
│       │   ├── classification.policy.ts              # priority/label ⇒ PLANNED|INTERRUPTION (default)
│       │   ├── time-edit-permission.policy.ts        # owner-or-admin default-deny
│       │   ├── duration.policy.ts                    # duration | start/end validation + derivation
│       │   └── *.spec.ts
│       └── events/
│           └── time-log.events.ts                    # (optional) emitted for future notifications
├── modules/work-items/
│   ├── work-items.contract.ts                 # EXTENDED: recordTimeStarted/Stopped/Logged/Edited/Deleted
│   └── services/work-item-access.service.ts   # EXTENDED: impl of the recordTime* methods
└── common/                                     # REUSED as-is: CLOCK, ID_GENERATOR, IdempotencyService,
                                                #   rbac guard + permissions, TenantScopedRepository

packages/
├── db/src/
│   ├── tables.ts                              # + timers, time_logs
│   ├── enums.ts                               # + timeEntrySourceEnum, timeEntryClassEnum;
│   │                                          #   activityActionEnum += 5 TIME_* values
│   ├── migrations/                            # one new generated migration
│   └── seed.ts                                # + demo timer + a few time_logs for local verify
├── contracts/src/
│   ├── time-tracking.contract.ts             # NEW DTOs: Timer, TimeLog, summaries, zod schemas
│   ├── work-items.contract.ts                # ActivityEntry action union += TIME_* (output only)
│   └── mcp/registry.ts                        # UNCHANGED (49 tools) — kept green by the parity gate
└── ui/src/
    ├── meter.tsx + meter.module.css          # NEW token-only plan-vs-actual meter (honey/over-red)
    └── index.ts                              # export <Meter>

apps/web/
├── app/(app)/projects/[projectId]/board/board-client.tsx   # row gains <Meter> (parallel rollup fetch)
├── app/(app)/projects/[projectId]/list/list-client.tsx     # row gains a meter column
├── components/item-detail.tsx                              # timer controls + entries list + time in feed
├── app/(app)/my-work/my-work-client.tsx                    # + "my time today / this week" summary
├── lib/api/time.ts                                         # NEW typed client (timers, logs, rollup, summary)
└── web.testplan.ts                                         # + time-tracking e2e (timer + meter + manual log)

scripts/                                       # existing gates apply; check-mcp-parity stays 49/49
└── check-mcp-parity.ts                        # + comment documenting the time-control v2 deferral
```

**Structure Decision**: Full-stack extension of the existing monorepo. Time tracking is a **new bounded
module** under `apps/api/src/modules/` (it owns `timers` + `time_logs`, their repositories, providers, and
domain policies, and exposes a `*.contract.ts`) — structurally identical to `work-items`, which is the
proven template. It is **not** an edge: time tracking has real domain state and invariants of its own. The
single cross-module seam is the work-items **contract** (item-access checks + `recordTime*` activity
append) — the same seam `comments`/`notifications` already use, so no new boundary pattern is invented.
The web meter is a reusable `packages/ui` primitive (token-only); the four touched surfaces slot into the
existing 003 `page.tsx` + `*-client.tsx` shells. Schema lives in `packages/db/src/tables.ts` (single
source of truth); shared DTOs in `packages/contracts`.

## Complexity Tracking

> One justified, spec-authorized deviation from strict Principle IV (API↔MCP parity). The enforced parity
> gate (`check-mcp-parity.ts`) remains green at 49/49; this row documents why the new time-tracking
> service use cases intentionally lack MCP tools in M2.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Time-tracking service use cases (start/stop timer, log/edit/delete time, aggregate) ship **without** corresponding MCP tools; the parity surface stays at 49/49 | The spec's locked scope for M2 is **"integrate into shipped surfaces, no pull-forward"** (Overview, Assumptions, Out of Scope, FR-FIN-004). Time-*control* via MCP and Slack is **v2** (`FR-TT-010`, `FR-INT-MCP-008`); M2 delivers time tracking as **web + REST** only. Adding tools now would pull v2 scope forward and grow the agent surface this milestone is required to hold flat. | Registering time tools in `registry.ts` now would require building their request/response schemas, idempotency-over-MCP, and parity tests for capabilities the milestone is explicitly **not** shipping — expanding scope beyond the MVP `Must` subset. The codebase has no separate "deferred-capabilities" list; the parity gate is kept green by **omitting** time capabilities from `serviceCapabilities` and documenting the omission with a comment, byte-for-byte the mechanism M3 used for credential flows. The formal milestone-wide parity expansion lands with v2 as the spec directs. |

## Risks & follow-ups (non-blocking)

- **Estimate units for the meter**: M2 interprets `work_items.estimate_value` as **hours** for the
  plan-vs-actual comparison (the branding meter shows hours). M1 stores it as a unitless `numeric`; if a
  later milestone formalizes estimate units, the meter's `estimateHours` mapping is the single place to
  revisit. Items with no estimate render logged time with **no** over/under judgement (FR-WEB-201).
- **Classification snapshot vs. live priority**: the `PLANNED`/`INTERRUPTION` class is **derived once at
  entry creation** (Urgent ⇒ interruption) and **snapshotted** on the row, with an explicit override flag,
  so later changes to item priority never silently re-split historical totals and planned+interruption
  always reconcile to total (research D6). Re-deriving live was rejected for that reason.
- **Row-meter rollup fan-in**: the Board/List fetch per-item totals from `GET /time/rollup` in parallel
  with the items list and merge client-side (work-items must not read `time_logs`). For very large boards
  this is one extra request, not N; if it ever needs trimming, the rollup is already keyset-friendly.
- **Realtime live ticking**: a running timer ticks **client-side** from the server's `startedAt`; the M1
  realtime seam (deviation C2) stays deferred. Two tabs converge on reload because the server is
  authoritative. Live push for a second viewer is a realtime-milestone nicety, not M2.
- **Timer on lost item access**: if a user loses access to an item while their timer runs, the timer is
  **their** record; stopping it still finalizes a `time_log` attributed to them (accrued time is never
  silently lost), and an admin can correct it. Proactive auto-stop on access change is out of scope.
- **Item deletion with time logs**: items soft-delete (`deleted_at`); `time_logs` persist but are
  **excluded from aggregations** for soft-deleted items (Edge Cases). Hard purge cascades logs and any
  `timers` row via the FK. Documented in data-model §Retention.
