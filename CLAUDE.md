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

**All planning/spec docs live in `knowledge/`** (not the repo root). Read in this order; each builds on the previous. Requirement IDs (`FR-*`, `NFR-*`), differentiators (`D1`–`D9`), and opportunities (`OPP-*`) are cited across the docs — trace decisions back through these IDs.

1. **`knowledge/VISION.md`** — the "why": problem, personas (note the **"Albert/Marissa test"** — must be usable by non-technical teammates), positioning, phased roadmap, monetization.
2. **`knowledge/features.md`** — capability matrix across 15 tools, MVP/v2/v3 feature tiers, the nine differentiators.
3. **`knowledge/REQUIREMENTS.md`** — functional/non-functional requirements with stable IDs; the testable spec.
4. **`knowledge/PRD.md`** — product scope, user stories, acceptance criteria, Stage 1 vs later.
5. **`knowledge/BRD.md`** — business objectives, success metrics, scope boundaries.
6. **`knowledge/ARCHITECTURE.md`** — **the single source of architectural truth.** Bounded contexts, data model, multi-tenancy, MCP parity, testing system, monorepo layout, CI/CD. Decisions are marked `▶ DECISION` and indexed as ADRs in §17.

### Where to find each piece of info (`knowledge/` map)

| File | What's in it / when to read |
|------|------------------------------|
| `knowledge/VISION.md` | Problem, personas, positioning, roadmap, monetization, North-Star metric. |
| `knowledge/features.md` | Capability matrix, MVP/v2/v3 tiers, the nine differentiators (D1–D9). |
| `knowledge/REQUIREMENTS.md` | Testable `FR-*`/`NFR-*` requirements — the authority for "must it do X?". |
| `knowledge/PRD.md` | Product scope, user stories, acceptance criteria, Stage 1 vs later. |
| `knowledge/BRD.md` | Business objectives, success metrics, scope boundaries. |
| `knowledge/ARCHITECTURE.md` | **Single architectural source of truth** — contexts, data model, multi-tenancy, MCP parity, testing, layout, ADRs (§17). |
| `knowledge/capability-catalog.md` | Exhaustive catalog of capabilities/use cases (maps to MCP-tool parity). |
| `knowledge/BUILD-PLAYBOOK.md` | Step-by-step build playbook. **Do not read unless explicitly asked** — drive build work from the Spec Kit flow and ARCHITECTURE.md instead. |
| `knowledge/research/pain-points-and-opportunities.md` | Ranked pain points → opportunities (`OPP-*`); the evidence layer under VISION/features. |
| `knowledge/research/competitors/mainstream-saas-suites.md` | SaaS competitor deep dive (Jira, Linear, Asana, Monday, ClickUp, etc.). |
| `knowledge/docs/competitor-deep-dive-open-source.md` | Open-source competitor deep dive (Plane, OpenProject, Taiga, Vikunja, Leantime, Huly, Redmine). |

The **North-Star metric** is CTW (Tasks Captured-and-Tracked per Active User per Week) — couples fast capture with honest time-tracking.

## Branding & design system (the visual source of truth)

**All brand + design-system assets live in `branding/`.** This is an original, from-scratch RyTask brand
(not derived from any existing product) delivered as a handoff bundle from Claude Design. It is the
authority for anything visual — when building UI (`apps/web/`, `packages/ui/`), match it; do not invent
colors, type, spacing, or components that contradict it.

| File / folder | What it is |
|---|---|
| `branding/colors_and_type.css` | **All design tokens** (color light+dark, type, spacing, radius, shadow, motion, layout) — the single source of truth. In product code, reference **only** the semantic `var(--*)` names, never raw primitives or hex. |
| `branding/RyTask Style Sheet.html` | The canonical one-page style sheet — logo, palettes, type, every core component, token visualizations, the "never do this" list. Light/dark toggle. |
| `branding/SKILL.md` | Agent-Skills entrypoint for reusing the brand when generating UI/mocks. |
| `branding/assets/` | Logo mark + wordmark SVGs (color, dark, mono). |
| `branding/preview/` | Design-System cards — swatches, type specimens, component states. |
| `branding/ui_kits/app/` | High-fidelity recreation of the RyTask app (sidebar + issue list with live plan-vs-actual time meters) to fork from. |
| `branding/README.md` | Design-system overview: voice, foundations, iconography, caveats. |
| `branding/HANDOFF.md`, `branding/chats/` | Provenance — the coding-agent handoff note and the design-session transcript (where the intent lives). |

**Non-negotiable brand rules** (full detail in `branding/README.md` + the style sheet):
- **Color:** `Sunbeam` yellow primary (`#ECB30A`) — **fills always take dark ink text, never white** (`--fg-on-accent`). `Honey` (`#D98A0E`) is the accent that carries *time/momentum*. Warm `Stone` neutrals. Only three semantic hues (green/amber/red) + one indigo for info/in-review. Both light **and** dark resolve from the same semantic token names. No teal/neon/off-palette color.
- **Type:** **Hanken Grotesk** for all UI; **Schibsted Grotesk** (800) for brand moments only; **Geist Mono** (`tabular-nums`) for *every figure* — times, estimates, counts, IDs. Base UI size 14px. (Inter is deliberately avoided.)
- **Aesthetic:** flat fills only — **no decorative gradients, no glassmorphism/frosted blur, no floaty colored shadows, no emoji as UI chrome.** Small radii (6/8/10/14px) signal precision; 1px hairlines do the structural work; elevation is a whisper. Motion is fast and calm — no bounce/overshoot; respect `prefers-reduced-motion`.
- **Signature move:** plan-vs-actual time meter lives *inside* the task row (honey fill vs. planned tick; over-budget turns red), plus Slack-style capture that parses `@assignee ~estimate #label`.
- **Voice/copy:** plain, kind, jargon-free — must pass the "non-technical teammate" (Albert/Marissa) test. Sentence case everywhere human; `UPPERCASE 0.06em` only for micro-labels.
- **Substitutions to resolve at production:** icons are **Lucide via CDN** (self-host a sprite for prod); fonts are pulled from Google Fonts (confirm the cuts); the logo is a v1 proposal open to iteration.

When UI code lands, tokens flow from `branding/colors_and_type.css` into `packages/ui/` / `apps/web/`; keep
that file as the upstream source rather than copy-pasting hex values around the codebase.

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
Active feature: **M4 Reporting — the flagship "Where did my time go?" report** (`006-m4-reporting`),
the last remaining Stage 1 (MVP) feature. Read-only, full-stack: the flagship planned-vs-interruption
report with plain-language narrative (FR-RPT-001), the **interruption ledger** with capture source /
"raised by" / per-week evidence (FR-RPT-002), **My week** with tracked-beside-estimate + completed items
+ copy-as-text digest (FR-RPT-007), and client-side **CSV export**. **Zero schema change, zero migration,
zero new dependency, zero new MCP tool (49/49), zero new permission.** For technologies, structure, and
the decisions driving current work, read the plan and its artifacts in `specs/006-m4-reporting/`:
- `plan.md` — technical context, Constitution Check (all PASS; Principle IV has one tracked,
  spec-authorized deferral — reports-via-API/MCP is FR-RPT-009 v2), structure, risks
- `research.md` — decisions D1–D14 (reporting = read-model providers **inside the time-tracking
  module**, no new module; shared-schema joins per the shipped `summarize` precedent; visibility via
  `accessibleProjectIds()` incl. **hardening the org-wide `/time/summary` path**; 3 GET endpoints
  `/time/reports/{overview,interruptions,week}`; UTC day / ISO-Monday-week bucketing identical to M2;
  completed-this-week via new work-items-contract `listCompletedForUser`; CSV + narrative + digest
  built client-side from rendered DTOs; figures-first UI, one token-only `<SplitBar>` (honey planned /
  amber interruption), no chart library; trashed items' time excluded everywhere — spec amended)
- `data-model.md` — NO new tables/enums/indexes; 3 computed read-models (`ReportOverview`,
  `InterruptionLedger`, `WeeklySummary`) + repository query shapes
- `contracts/` — `reports-rest` (3 routes, DTOs, errors, `/time/summary` hardening),
  `web-surfaces` (`/reports` + `/reports/week`, nav entry, CSV/copy behavior, tokens, a11y)
- `quickstart.md` — run/verify each US and the CI gates

Key invariants for this work: **read-only by contract** (no writes, no activity rows, no notifications —
FR-015); **reconciliation everywhere** — planned + interruption == logged at every level and the ledger
total == the headline interruption figure for the same range/scope (SC-002/003, one integration spec is
the authority); **visibility never exceeds readable projects** — `assertRole(VIEWER)` when `projectId`
is supplied, else `IN accessibleProjectIds()`, applied to the new routes AND the shipped org-wide
`/time/summary` (FR-013/SC-007); soft-deleted entries and trashed items' time are excluded from every
figure (the M2 D15 invariant); all routes `@RequirePermission('work:read')`; weeks are ISO Monday (UTC,
`date_trunc` — M2's convention); `weekStart` must be a Monday (400 otherwise). New UI is token-only
(`check-design-tokens`), **no new tokens** — `--time-actual`/`--warning`/`--time-track-bg` for the
split, `--time-over` red reserved for over-estimate; every figure Geist Mono `tabular-nums`.
`check-mcp-parity` stays **green at 49/49** (`module.testplan.ts` keeps `mcpTools: []`; omission +
comment cites FR-RPT-009 v2). Must not break M0–M3/005 contracts (`TenantScopedRepository`, the
work-items/projects contracts, `/time/summary|rollup` consumers, the 49-tool registry).
<!-- SPECKIT END -->
