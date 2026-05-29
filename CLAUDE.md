# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**RyTask** ([rytask.app](https://rytask.app)) — an open-source, self-hostable project-management & issue tracker. A serious alternative to Plane, OpenProject, Linear, Jira, and ClickUp, aimed at small interrupt-driven teams. Three differentiators define it: **free native time-tracking + plan-vs-actual reporting**, **first-class Slack capture**, and a **full-control MCP server** (anything a human can do in the UI, an AI agent can do via MCP) — delivered self-hosted with a non-technical-friendly UX. License: AGPL-3.0 (proposed).

> **Status: planning repo, pre-code.** There is **no application code yet** and this is **not a git repository**. The repo currently holds the planning documents (the spec) and the Spec Kit scaffolding. Code lands once Stage 1 scope is locked. Do not invent or scaffold a stack that contradicts the FIXED choices below.

## How work is done here (Spec-Driven Development)

This project is built with **Spec Kit** (the `.specify/` directory). The full cycle is **specify → plan → tasks → implement**, with clarify/analyze gates. Use these via the corresponding skills (invoke with `/speckit-<name>`):

| Skill | Purpose |
|-------|---------|
| `speckit-constitution` | Create/update the project constitution (`.specify/memory/constitution.md` — currently an **unfilled template**). |
| `speckit-specify` | Turn a feature description into `specs/<feature>/spec.md`. |
| `speckit-clarify` | Ask up to 5 targeted questions to de-risk an underspecified spec; encode answers back. |
| `speckit-plan` | Generate design artifacts (`plan.md`) from the spec + this stack. |
| `speckit-tasks` | Generate a dependency-ordered `tasks.md`. |
| `speckit-analyze` | Non-destructive cross-artifact consistency check across spec/plan/tasks. |
| `speckit-implement` | Execute `tasks.md`. |
| `speckit-checklist` | Generate a custom quality checklist for a feature. |

Feature work is scaffolded by `.specify/scripts/bash/create-new-feature.sh` into `specs/<branch-name>/`. A git extension (`speckit-git-*` skills, `.specify/extensions/git/`) handles repo init, feature branches, and auto-commit — relevant because this is not yet a git repo.

## The planning documents (the source of truth)

Read in this order; each builds on the previous. Requirement IDs (`FR-*`, `NFR-*`), differentiators (`D1`–`D9`), and opportunities (`OPP-*`) are cited across the docs — trace decisions back through these IDs.

1. **VISION.md** — the "why": problem, personas (note the **"Albert/Marissa test"** — must be usable by non-technical teammates), positioning, phased roadmap, monetization.
2. **features.md** — capability matrix across 15 tools, MVP/v2/v3 feature tiers, the nine differentiators.
3. **REQUIREMENTS.md** — functional/non-functional requirements with stable IDs; the testable spec.
4. **PRD.md** — product scope, user stories, acceptance criteria, Stage 1 vs later.
5. **BRD.md** — business objectives, success metrics, scope boundaries.
6. **ARCHITECTURE.md** — **the single source of architectural truth.** Bounded contexts, data model, multi-tenancy, MCP parity, testing system, monorepo layout, CI/CD. Decisions are marked `▶ DECISION` and indexed as ADRs in §17.

Supporting: `capability-catalog.md`, `research/`, `docs/`. The **North-Star metric** is CTW (Tasks Captured-and-Tracked per Active User per Week) — couples fast capture with honest time-tracking.

## FIXED technical stack (do not substitute)

- **Backend:** NestJS — a **modular monolith** with hard, extractable module boundaries.
- **Frontend:** Next.js (App Router, RSC).
- **ORM/DB:** Drizzle ORM over PostgreSQL 16.
- **Queues/cache/realtime:** Redis 7 + BullMQ; WebSockets (Redis pub/sub fan-out).
- **Integrations:** Slack bot, GitHub App, first-party **MCP server**.
- **Monorepo:** pnpm workspaces + Turborepo. Lint/format: **Biome** (single quotes, 2-space, 100 cols, trailing commas, LF).
- **Tests:** Vitest (unit + integration against **real Postgres**), supertest (contract), Playwright (E2E), axe (a11y), k6 (load).

### Planned layout (when code lands — ARCHITECTURE.md §16)

```
apps/api/          NestJS — serves both API and worker via entrypoint (same image, WORKER=1)
apps/web/          Next.js
packages/db/       Drizzle schema (src/tables.ts = source of truth), migrations, seed
packages/contracts/ shared DTOs + OpenAPI + MCP tool schemas (single contract, drift-proof)
packages/ui/       shared React components
packages/config/   tsconfig, biome, vitest, boundary presets
packages/sdk/      generated TS client from OpenAPI
infra/docker/      Dockerfiles + compose;  infra/helm/ (future)
scripts/           check-required-tests.ts, check-mcp-parity.ts
```

## Architecture invariants (must hold once code exists)

These are non-obvious rules that govern all code; they are enforced by lint + architecture tests + CI, not by convention alone.

- **Module boundaries are hard.** A module exposes a public `*.contract.ts` service interface and domain events. It **never** imports another module's repositories or reaches into its tables. Cross-module reads go through the owning module's service or a published read-model.
- **Multi-tenant by construction.** Every tenant-scoped table carries `organizationId` (and `workspaceId` where relevant), `NOT NULL`, with composite indexes leading on `organizationId`. The org is resolved by `TenantGuard` into `AsyncLocalStorage`; every repository extends `TenantScopedRepository`, which auto-injects `WHERE organizationId = :orgId`. **Raw, unscoped Drizzle access is forbidden.** Cross-tenant isolation is asserted by automated tests (FR-TEN-001).
- **API-first & event-driven.** The REST API and domain events are *the* contract. UI, Slack bot, MCP server, and integrations are all clients of the same API/event bus — never special-cased back doors.
- **`api` and `worker` share one codebase and one Docker image**, started with different entrypoints. Domain logic lives once; request-handling and background processing scale independently.
- **MCP = 100% parity.** Every service use case must have a corresponding MCP tool; a parity test (`check-mcp-parity.ts`) enforces this (FR-INT-MCP-009).
- **Drizzle schema in `packages/db/src/tables.ts` is the single source of truth.** IDs are UUIDv7/ULID (sortable, safe to expose), timestamps `timestamptz`, soft-delete via `deletedAt` only where recovery is required.
- **Ports & adapters at the edges.** External I/O (DB, Redis, Slack, GitHub, S3, email, `Clock`, `IdGenerator`) sits behind interfaces so domain logic is pure and testable without infrastructure.
- **Idempotent & replay-safe.** Every external webhook (Slack/GitHub) and every mutating public API call supports idempotency; jobs are safe to retry.

## Testing policy (closed / no-merge-without-tests)

The architecture *forces* testability and CI *refuses to merge* without it (ARCHITECTURE.md §14). When implementing:

- Each module declares its required tests in `module.testplan.ts`. `scripts/check-required-tests.ts` **fails the build if a required test is missing** — not only if existing tests fail.
- Required coverage: every provider → ≥1 integration test; every controller route → ≥1 contract test; every domain policy/validator → unit tests; every MCP tool → contract test + parity; every tenant-scoped table → tenancy-isolation test; every BullMQ processor → integration test (enqueue→process→assert, idempotent on replay); every `Must` requirement → ≥1 automated test.
- **Integration tests run against real PostgreSQL** (testcontainers/docker), not mocks — a deliberate stance: mocks hide tenancy/SQL bugs.
- Coverage gates: ≥80% line (server), ≥90% in `domain/` + `providers/`, ≥90% branch on domain policies.

## Commands

**There are no build/test/run commands yet** — no `package.json`, no toolchain. The following are the *planned* commands documented in README.md and ARCHITECTURE.md; they are **not yet runnable**:

```bash
docker compose up -d        # planned: full stack (web :3000, api :3001, postgres, redis, minio, mailhog)
make up / seed / test / backup   # planned convenience wrappers
pnpm test:coverage          # planned: Vitest with coverage gates
drizzle-kit migrate         # planned: transactional migrations (never db:push in prod)
```

Until code lands, the actionable "commands" are the Spec Kit skills above and the scripts in `.specify/scripts/bash/`.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
