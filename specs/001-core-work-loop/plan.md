# Implementation Plan: Core Work Loop (Milestone M1)

**Branch**: `001-core-work-loop` | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-core-work-loop/spec.md`

## Summary

M1 delivers the **core work loop** — capture a work item in seconds (quick-add inline grammar),
give it structure (markdown, priority, single assignee, labels, estimate, dual dates, sub-tasks),
move it across **customizable categorized statuses** on a **Board/List**, organize into **projects**
with membership and a cross-project **"My Work"** view, slice with an **AND/OR filter engine** plus
**saved + smart views**, **collaborate** via threaded comments/@mentions feeding an **in-app
notification inbox**, and **find** anything via permission-aware full-text search and a Cmd-K palette.

Technical approach (from `research.md`): extend the existing green walking-skeleton monorepo
(NestJS modular monolith + Next.js App Router + Drizzle/Postgres + Redis/BullMQ). New bounded
contexts `projects`, `work-items`, `comments`, `views`, `search`, `notifications` each follow the
proven **provider-per-operation + tenant-scoped repository + ports/adapters** pattern in
`apps/api/src/modules/health/`. A single **filter AST → Drizzle** query engine powers list/board/
views/search with **keyset cursor pagination**. Tenancy is structural (`organization_id` on every
table, auto-scoped repositories). The closed testing system (per-module `module.testplan.ts`, real
ephemeral Postgres, contract tests, Playwright e2e) gates the merge, with coverage thresholds raised
to the constitution gates.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (pinned `.nvmrc`); pnpm 9.15.9 (corepack)

**Primary Dependencies**: NestJS 11, Next.js 15.1 (App Router/RSC), Drizzle ORM 0.38, BullMQ + Redis
7, `@nestjs/event-emitter`, `@nestjs/websockets` (gateway seam only), Zod (DTO/contract schemas),
Biome 1.9.4, Turborepo 2

**Storage**: PostgreSQL 16 (system of record; native FTS via generated `tsvector` + GIN); Redis 7
(BullMQ queues, cache, idempotency, rate-limit). Object storage/email not required for M1.

**Testing**: Vitest 2.1.8 (unit + integration against **real ephemeral Postgres** via testcontainers
helper `apps/api/src/common/testing/postgres.ts`), supertest (contract), Playwright + axe (e2e/a11y).
Gates: `check-required-tests`, `check-mcp-parity`, dependency-cruiser boundaries (all already wired).

**Target Platform**: Linux server (Docker); `docker compose up` one-command stack (web :3000,
api :3001, postgres, redis, + dev mailhog/minio already in compose).

**Project Type**: Web application (monorepo: `apps/web` frontend + `apps/api` backend/worker, shared
`packages/*`).

**Performance Goals**: quick-capture p95 < 400 ms to ack (FR-WI-004 "≤2s", SC-001); board open p95 <
300 ms (cached); Board/List responsive at ~1,000 items (SC-011); search returns ranked scoped results.

**Constraints**: tenant isolation = 0 cross-org leaks (SC-014); keys unique/sequential/never-recycled
(SC-003); exactly-one notification per event (SC-010); compound filters exactly correct (SC-006);
coverage ≥80% line / ≥90% domain+providers / ≥90% branch on domain policies (Principle V).

**Scale/Scope**: single org/workspace in practice (multi-tenant by construction, FR-TEN-003); ~6 new
backend modules; ~13 new tables; REST surface ~40 routes under `/api/v1`; 8 user stories (P1–P3).

**Upstream dependency**: **M0 (Foundation)** — real auth, PAT issuance, `TenantGuard` org resolution
into `AsyncLocalStorage`, and RBAC must be in place for M1's tenancy-isolation and RBAC tests to pass.
The scaffold currently ships these guards as **pass-through stubs**; M1 is authored against the
intended behaviour and is **not mergeable until M0 populates them** (research D0).

## Constitution Check

*GATE: re-checked after Phase 1 design — see "Post-Design Re-Check" below. Status: **PASS** with two
tracked, justified deviations (Complexity Tracking).*

| Principle | M1 compliance | Status |
|---|---|---|
| **I. Fixed Tech Stack** | NestJS modular monolith, Next.js App Router/RSC, Drizzle/PG16, Redis 7 + BullMQ, pnpm+Turbo, Biome. No substitutions. | ✅ PASS |
| **II. Multi-Tenancy by Construction** | Every M1 table carries `organization_id NOT NULL` with org-leading composite indexes (data-model §2); reads via `TenantScopedRepository`; org resolved server-side (M0 `TenantGuard`→ALS); per-table tenancy-isolation tests (data-model §5, SC-014). | ✅ PASS (verified by M0) |
| **III. Modular Monolith & Hexagonal** | New bounded contexts `projects/work-items/comments/views/search/notifications`, each exposing a `*.contract.ts`; **provider-per-operation**; ports for `Clock`/`IdGenerator`/Redis (already in `common/ports/`); Drizzle is SSOT. Boundaries enforced by dependency-cruiser (already catches violations). | ✅ PASS |
| **IV. API ↔ MCP Parity** | Every M1 capability registered + matched 1:1 with an MCP tool *definition* (`contracts/mcp-tools.md`); `check-mcp-parity` stays truly green. **MCP transport deferred** → Complexity Tracking C1. | ⚠️ PASS w/ deviation |
| **V. Test-First & Enforced Coverage** | Per-module `module.testplan.ts` (unit/integration/contract/tenancy); integration vs **real Postgres**; create→board→update Playwright e2e; coverage gates **raised** to constitution thresholds (research D18). | ✅ PASS |
| **VI. Secure by Default** | RBAC matrix on every mutating route (`contracts/README.md`, `openapi.yaml` `x-rbac`); authz server-side from principal+tenant; secrets via env only. Depends on M0 auth (D0). | ✅ PASS (verified by M0) |
| **VII. One-Command Self-Hosting** | No new always-on services (M1 search uses Postgres FTS, not an external engine); `api`+`worker` share one image; seed extended so `docker compose up` yields a usable workspace. | ✅ PASS |

**Realtime note**: the WS gateway seam is established but live fan-out is deferred (spec Assumptions)
→ Complexity Tracking C2 (a *scope* deferral, not a principle violation).

## Project Structure

### Documentation (this feature)

```text
specs/001-core-work-loop/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D0–D18
├── data-model.md        # Phase 1 — enums + 13 M1 tables
├── quickstart.md        # Phase 1 — run/seed/test the M1 slice
├── contracts/           # Phase 1 — REST OpenAPI, filter DSL, MCP catalog
│   ├── README.md
│   ├── openapi.yaml
│   ├── filter-dsl.md
│   └── mcp-tools.md
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root — extends the existing scaffold)

```text
apps/
  api/                                   # NestJS (api + worker, one image)
    src/
      common/                            # EXISTING — reuse
        tenancy/ (TenantContextService, TenantScopedRepository)
        guards/  (Auth/Tenant/RBAC/Throttle — populated by M0)
        ports/   (Clock, IdGenerator, Redis, Mailer, Slack, GitHub)
        testing/ (postgres.ts testcontainers helper, testplan.ts)
      modules/
        health/                          # EXISTING — pattern reference
        projects/                        # NEW — projects, members, counters, statuses
          projects.module.ts | projects.contract.ts | module.testplan.ts
          controllers/ services/ providers/ repositories/ domain/ dto/ events/
        work-items/                      # NEW — items, labels, watchers, activity, quick-add
          providers/ (create, update, move, assign, delete, restore, add-subtask, …)
          domain/ (quick-add.parser, hierarchy.policy, overdue.policy)
        comments/                        # NEW — threaded comments + mention parsing
        views/                           # NEW — saved views + filter AST query engine
          domain/ (filter.ast, query-compiler, smart-views)
        search/                          # NEW — Postgres FTS, permission-aware
        notifications/                   # NEW — event consumers, dedup, inbox
          processors/ (notifications.dispatch — BullMQ)
      realtime/                          # NEW (seam) — WS gateway, scoped channels (no fan-out yet)
  web/                                   # Next.js App Router (EXISTING shell)
    app/
      projects/[projectId]/board/        # NEW — Kanban (DnD)
      projects/[projectId]/list/         # NEW — List (inline edit)
      my-work/                           # NEW — cross-project smart view
      inbox/                             # NEW — notification center
      components/ (quick-add, command-palette[Cmd-K], filter-bar, item-detail)
    e2e/                                 # NEW — create→board→update.e2e.spec.ts (+ axe)
packages/
  db/src/
    enums.ts                             # NEW — priority, status_category, … (data-model §1)
    tables.ts                            # EXTEND — add the 13 M1 tables + schema/type exports
    seed.ts                              # EXTEND — default project/statuses/items
    migrations/                          # NEW generated SQL (drizzle-kit generate)
  contracts/src/
    work-items.contract.ts | projects.contract.ts | views.contract.ts | …  # NEW Zod DTOs
    mcp/registry.ts                      # EXTEND — M1 tool definitions (parity)
  sdk/                                   # regenerate from OpenAPI
  ui/                                    # shared components as needed
scripts/
  check-required-tests.ts | check-mcp-parity.ts   # EXISTING gates — extended by new modules
```

**Structure Decision**: Reuse the existing monorepo (matches `knowledge/ARCHITECTURE.md` §16 and the
scaffold). Each new bounded context is a NestJS module under `apps/api/src/modules/<context>/`
following the `health` module's shape (controllers/services/providers/repositories/domain/dto/events
+ `module.testplan.ts`). Shared DTO/contract types and the MCP registry live in `packages/contracts`;
the Drizzle schema stays the single source of truth in `packages/db/src/tables.ts`.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **C1 — MCP tool *definitions* present, MCP *transport* deferred** (Principle IV) | Spec scopes the MCP **server** out of M1, but Principle IV demands mechanically-verified parity. Registering capabilities + tool definitions keeps `check-mcp-parity` *truly* green and prevents surface drift before the MCP milestone, at near-zero cost (definitions describe the existing service surface). | *Leave `serviceCapabilities` empty* → gate falsely green, silently violates Principle IV. *Ship full MCP transport in M1* → contradicts the spec's scope boundary and expands the test matrix (PAT sessions, dry-run, context tools). |
| **C2 — WS gateway seam without live fan-out** (scope, not a principle) | The build request asks for a "WebSocket gateway for realtime", but the spec defers realtime collab/fan-out to a later milestone. Standing up the authenticated, tenant-scoped gateway now means the realtime milestone only adds publishers, not a new surface. | *Full live sync in M1* → out of scope per spec; adds presence/conflict/reconnection test surface. *No gateway at all* → forces a later retrofit of auth + channel scoping onto a live system. |

> Both deviations are **tracked and time-boxed to their named later milestones**; neither weakens a
> CI gate (parity stays green; tenancy/RBAC/coverage gates are fully enforced for all M1 code).

## Post-Design Re-Check (after Phase 1)

Re-evaluated against the data model and contracts: tenancy holds on all 13 tables (II); module
boundaries and provider-per-operation are reflected in the structure and data-model §4 ownership map
(III); parity catalog is complete and 1:1 (IV, deviation C1 tracked); every `Must` requirement maps to
a contract route + a declared required test (V); RBAC matrix covers every mutating route (VI); no new
always-on service was introduced (VII). **Gate result: PASS.** Ready for `/speckit-tasks`.
