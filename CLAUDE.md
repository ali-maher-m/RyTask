# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

**RyTask** ([rytask.app](https://rytask.app)) — an open-source, self-hostable project-management & issue tracker. A serious alternative to Plane, OpenProject, Linear, Jira, and ClickUp, aimed at small interrupt-driven teams. Three differentiators define it: **free native time-tracking + plan-vs-actual reporting**, **first-class Slack capture**, and a **full-control MCP server** (anything a human can do in the UI, an AI agent can do via MCP) — delivered self-hosted with a non-technical-friendly UX. License: AGPL-3.0-only.

> **Status: Stage 1 (MVP) code has landed and is committed on `main`.** The walking skeleton plus milestones **M0–M5** are implemented, tested, and merged: identity/tenancy/onboarding, the core work loop (work items, projects, statuses, comments, views, search, notifications), fast capture via Slack, the **first-party MCP server (49 tools, 100% parity)**, the flagship time-tracking + plan-vs-actual reporting, and M5 GitHub linking + full workspace export. Both the README's "planning repo, pre-code" banner and `knowledge/` docs predate the code — when they disagree with what's in `apps/`, `packages/`, and the git history, **the code is the truth.**

The repo still also holds the planning documents (`knowledge/`), the brand bundle (`branding/`), and the Spec Kit scaffolding (`.specify/`) used to drive each feature.

## FIXED technical stack (do not substitute)

- **Backend:** NestJS 11 — a **modular monolith** with hard, extractable module boundaries (`apps/api`).
- **Frontend:** Next.js 15 (App Router, RSC), React 19 (`apps/web`).
- **Docs:** Next.js 16 + Fumadocs (`apps/docs`).
- **ORM/DB:** Drizzle ORM 0.38 over PostgreSQL 16.
- **Queues/cache/realtime:** Redis 7 + BullMQ; WebSockets (Redis pub/sub fan-out).
- **Integrations:** Slack bot (`@slack/oauth`, `@slack/web-api`), GitHub App, first-party **MCP server** (`@modelcontextprotocol/sdk`, HTTP + stdio transports).
- **Monorepo:** pnpm 9 workspaces + Turborepo, Node ≥22. Lint/format: **Biome** (single quotes, 2-space, 100 cols, trailing commas, LF).
- **Tests:** Vitest (unit + integration against **real Postgres** via testcontainers), supertest (contract), Playwright + axe (E2E + a11y), k6 (load).

## Repository layout (what actually exists)

```
apps/api/          NestJS — serves API, worker (WORKER=1), and MCP stdio (main.mcp.ts) from one image
apps/web/          Next.js app (App Router; route groups (app)/(auth), e2e/ Playwright specs)
apps/docs/         Fumadocs site (MCP tool pages auto-generated from the contracts registry)
packages/db/       Drizzle schema — src/tables.ts is the source of truth; enums.ts, ids.ts, migrate.ts, seed.ts
packages/contracts/ shared DTO/contract files (*.contract.ts) + the MCP tool registry (src/mcp/registry.ts)
packages/ui/       shared React components + generated src/styles/tokens.css
packages/sdk/      generated TS client
packages/config/   shared tsconfig/biome/vitest presets + dependency-cruiser.cjs (boundary rules)
infra/docker/      Dockerfiles + compose;  infra/helm/ (future);  infra/k6/ (load)
scripts/           check-required-tests.ts, check-mcp-parity.ts, check-design-tokens.ts, sync-tokens.ts
specs/             Spec Kit feature folders (001…007), one per milestone
```

### apps/api module anatomy (the repeating pattern)

Each business module under `apps/api/src/modules/<name>/` follows the same shape, and new modules MUST match it:

- `<name>.contract.ts` — the module's **only** public surface (service interface + types). Other modules import this, never internals.
- `<name>.module.ts` — NestJS wiring; registered in `apps/api/src/app.module.ts`.
- `providers/` — one provider per use case (`*.provider.ts`), each with a co-located `*.int.spec.ts` (integration test vs real Postgres).
- `controllers/` — REST controllers (`*.controller.ts`) with co-located `*.contract.spec.ts` (supertest).
- `domain/` — pure policies/parsers/mappers (`*.policy.ts`, `*.parser.ts`) with unit `*.spec.ts`.
- `repositories/` — the **only** place tenant-scoped DB access is allowed; repos extend `TenantScopedRepository`.
- `events/` — published domain events (`*.event.ts`); other modules may subscribe to these.
- `module.testplan.ts` — declares the REQUIRED tests + the MCP tools this module owns (drives the closed-testing + parity gates).

Cross-cutting concerns live in `apps/api/src/common/` (auth, guards, tenancy, rbac, idempotency, ports/adapters, redis, crypto, testing helpers). The MCP server lives in `apps/api/src/mcp/` (tools, transport, auth, dispatch). Current modules: `identity`, `orgs`, `projects`, `work-items`, `comments`, `views`, `search`, `notifications`, `slack`, `time-tracking`, `github`, `export`, `health`.

## Commands

Run from the repo root unless noted. Node 22 + pnpm 9 (`corepack enable`).

```bash
pnpm install                       # install workspace deps
pnpm build                         # turbo: build all packages/apps
pnpm dev                           # turbo: run all dev servers (persistent)
pnpm lint                          # Biome check (lint + format) across the repo
pnpm lint:fix                      # Biome autofix
pnpm typecheck                     # turbo: tsc --noEmit across packages/apps
```

### Tests

```bash
pnpm test                          # turbo: unit + contract tests everywhere (Vitest run)
pnpm test:integration              # integration tests vs REAL Postgres — needs Docker (see note below)
pnpm test:e2e                      # Playwright E2E (apps/web) — needs a running stack
pnpm test:coverage                 # Vitest with the coverage gates

# Run a single api unit/contract test (cwd apps/api):
pnpm --filter @rytask/api test -- path/to/file.spec.ts          # one file
pnpm --filter @rytask/api test -- -t "name of the test"         # by test-name pattern
pnpm --filter @rytask/api test:integration -- path/to/file.int.spec.ts   # one integration file

# Run a single web unit test / one e2e spec:
pnpm --filter @rytask/web test -- path/to/file.test.tsx
pnpm --filter @rytask/web test:e2e -- e2e/some.spec.ts
```

API test configs: `vitest.config.ts` (unit + contract), `vitest.integration.config.ts` (`*.int.spec.ts`, `*.tenancy.spec.ts`, and the cross-cutting tenancy/security suites — real Postgres), `vitest.coverage.config.ts`.

### Architecture & policy gates (CI refuses to merge without these — run them locally)

```bash
pnpm check:required-tests          # FAILS if any test a *.testplan.ts declares as REQUIRED is MISSING (not just failing)
pnpm check:mcp-parity              # every service capability has an MCP tool & vice-versa — must stay green at 49/49
pnpm check:boundaries              # dependency-cruiser: no cross-module internals, no raw db outside repositories, no cycles
pnpm check:design-tokens           # apps/web + packages/ui must use semantic var(--*) tokens only (no hex, no off-palette)
make checks                        # convenience: required-tests + mcp-parity + boundaries
```

### Database

```bash
pnpm db:generate                   # drizzle-kit generate (after editing packages/db/src/tables.ts)
pnpm db:migrate                    # apply migrations (tsx src/migrate.ts) — transactional; never db:push in prod
pnpm db:seed                       # deterministic seed
```

### Docker / full stack (Makefile wrappers)

```bash
make up                            # docker compose up -d --build (web :3000, api :3001, postgres, redis, minio, mailhog)
make dev                           # stack with hot reload
make migrate / make seed / make backup
make down / make logs
```

> **Integration tests need a Docker daemon (testcontainers).** On OrbStack, export `DOCKER_HOST` to the OrbStack socket and disable Ryuk before running `pnpm test:integration` / `*.tenancy.spec.ts` (e.g. `export DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock` and `export TESTCONTAINERS_RYUK_DISABLED=true`).

## Architecture invariants (must hold — enforced by lint + architecture tests + CI, not convention)

- **Module boundaries are hard.** A module exposes a public `*.contract.ts` service interface and `events/`. It **never** imports another module's repositories/providers/services/domain or reaches into its tables. Cross-module reads go through the owning module's contract service or a published event/read-model. (`check:boundaries`.)
- **Multi-tenant by construction.** Every tenant-scoped table carries `organizationId` (and `workspaceId` where relevant), `NOT NULL`, with composite indexes leading on `organizationId`. The org is resolved by `TenantGuard` into `AsyncLocalStorage`; every repository extends `TenantScopedRepository`, which auto-injects `WHERE organizationId = :orgId`. **Raw, unscoped Drizzle access outside `repositories/` (and `common/database`, `common/tenancy`) is forbidden.** Cross-tenant isolation is asserted by automated tests.
- **API-first & event-driven.** The REST API and domain events are *the* contract. UI, Slack bot, MCP server, and integrations are all clients of the same API/event bus — never special-cased back doors.
- **`api`, `worker`, and `mcp:stdio` share one codebase and one Docker image**, started with different entrypoints (`main.ts`, `WORKER=1 main.ts`, `main.mcp.ts`). Domain logic lives once.
- **MCP = 100% parity.** Every service use case has a corresponding MCP tool, declared in each module's `module.testplan.ts` and aggregated in `packages/contracts/src/mcp/registry.ts`. `check:mcp-parity` enforces this — currently **49/49**.
- **`packages/db/src/tables.ts` is the single source of truth** for the schema. IDs are UUIDv7/ULID (sortable, safe to expose), timestamps `timestamptz`, soft-delete via `deletedAt` only where recovery is required.
- **Ports & adapters at the edges.** External I/O (DB, Redis, Slack, GitHub, S3, email, `Clock`, `IdGenerator`, password hasher, crypto) sits behind interfaces in `common/ports` / `common/adapters` so domain logic is pure and testable without infrastructure.
- **Idempotent & replay-safe.** Every external webhook (Slack/GitHub) and every mutating public API call supports idempotency; BullMQ jobs are safe to retry. (Note: BullMQ rejects `:` in custom job IDs — don't reintroduce it.)

## Testing policy (closed / no-merge-without-tests)

CI *refuses to merge* without the declared tests existing — not merely passing.

- Each module declares its required tests in `module.testplan.ts` (and the web app in `apps/web/web.testplan.ts`). `check:required-tests` **fails the build if a required test file is missing**.
- Required coverage: every provider → ≥1 integration test; every controller route → ≥1 contract test; every domain policy/validator → unit tests; every MCP tool → contract test + parity; every tenant-scoped table → tenancy-isolation test; every BullMQ processor → integration test (enqueue→process→assert, idempotent on replay); every `Must` requirement → ≥1 automated test.
- **Integration tests run against real PostgreSQL** (testcontainers), not mocks — a deliberate stance: mocks hide tenancy/SQL bugs.
- Coverage gates: ≥80% line (server), ≥90% in `domain/` + `providers/`, ≥90% branch on domain policies.

## Branding & design system (the visual source of truth)

**All brand + design-system assets live in `branding/`.** It is the authority for anything visual — when building UI (`apps/web/`, `packages/ui/`), match it; do not invent colors, type, spacing, or components that contradict it. Tokens flow `branding/colors_and_type.css → packages/ui/src/styles/tokens.css → apps/web` (via `pnpm sync:tokens`) and are **never** copy-pasted as raw values. `check:design-tokens` enforces token-only UI.

**Non-negotiable brand rules** (full detail in `branding/README.md` + `branding/RyTask Style Sheet.html`):
- **Color:** `Sunbeam` yellow primary (`#ECB30A`) — **fills always take dark ink text, never white** (`--fg-on-accent`). `Honey` (`#D98A0E`) carries *time/momentum*. Warm `Stone` neutrals. Only three semantic hues (green/amber/red) + one indigo for info/in-review. Light **and** dark resolve from the same semantic token names. No teal/neon/off-palette color.
- **Type:** **Hanken Grotesk** for all UI; **Schibsted Grotesk** (800) for brand moments only; **Geist Mono** (`tabular-nums`) for *every figure* — times, estimates, counts, IDs. Base UI size 14px. (Inter is deliberately avoided.)
- **Aesthetic:** flat fills only — **no decorative gradients, no glassmorphism/frosted blur, no floaty colored shadows, no emoji as UI chrome.** Small radii (6/8/10/14px); 1px hairlines do the structural work; elevation is a whisper. Motion is fast and calm — no bounce/overshoot; respect `prefers-reduced-motion`.
- **Signature move:** plan-vs-actual time meter lives *inside* the task row (honey fill vs. planned tick; over-budget turns red), plus Slack-style capture that parses `@assignee ~estimate #label`.
- **Voice/copy:** plain, kind, jargon-free — must pass the "non-technical teammate" (Albert/Marissa) test. Sentence case everywhere human; `UPPERCASE 0.06em` only for micro-labels.

## How features are built (Spec-Driven Development)

Each milestone is driven through **Spec Kit** (`.specify/`): **specify → clarify → plan → tasks → analyze → implement**, with the constitution (`.specify/memory/constitution.md`, currently 8 principles) as the governing contract. Invoke the skills with `/speckit-<name>` (`speckit-specify`, `speckit-clarify`, `speckit-plan`, `speckit-tasks`, `speckit-analyze`, `speckit-implement`, `speckit-checklist`, `speckit-constitution`). Per-feature artifacts (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`, `quickstart.md`) live in `specs/<feature>/`. The `speckit-git-*` skills handle feature branches and auto-commit. **Drive build work from the Spec Kit flow + ARCHITECTURE.md, not from `knowledge/BUILD-PLAYBOOK.md`.**

## The planning documents (`knowledge/` map)

Background/intent (written pre-code; trace requirement IDs `FR-*`/`NFR-*`, differentiators `D1`–`D9`, opportunities `OPP-*` across them). `knowledge/ARCHITECTURE.md` remains the single architectural source of truth (ADRs in §17).

| File | What's in it |
|------|--------------|
| `knowledge/VISION.md` | Problem, personas (the **Albert/Marissa test**), positioning, roadmap, monetization, North-Star metric (**CTW** — Tasks Captured-and-Tracked per Active User per Week). |
| `knowledge/features.md` | Capability matrix, MVP/v2/v3 tiers, the nine differentiators (D1–D9). |
| `knowledge/REQUIREMENTS.md` | Testable `FR-*`/`NFR-*` — authority for "must it do X?". |
| `knowledge/PRD.md` / `knowledge/BRD.md` | Product scope & user stories / business objectives & success metrics. |
| `knowledge/ARCHITECTURE.md` | **Single architectural source of truth** — contexts, data model, multi-tenancy, MCP parity, testing, layout, ADRs (§17). |
| `knowledge/capability-catalog.md` | Exhaustive capability/use-case catalog (maps to MCP-tool parity). |
| `knowledge/research/` + `knowledge/docs/` | Pain-points→opportunities evidence; SaaS + open-source competitor deep dives. |
| `knowledge/BUILD-PLAYBOOK.md` | **Do not read unless explicitly asked** — drive build work from Spec Kit + ARCHITECTURE.md instead. |
