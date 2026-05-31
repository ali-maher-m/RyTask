<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification. Template placeholders replaced with concrete,
project-specific principles. First adoption, so MAJOR version 1.0.0.

Principles defined (initial set, 7 per user input):
- I.   Fixed Technology Stack
- II.  Multi-Tenancy by Construction
- III. Modular Monolith & Hexagonal Architecture
- IV.  API <-> MCP Parity
- V.   Test-First & Enforced Coverage (NON-NEGOTIABLE)
- VI.  Secure by Default
- VII. One-Command Self-Hosting

Added sections (replacing generic template slots):
- Additional Engineering Constraints
- Development Workflow & Quality Gates
- Governance (concrete amendment + versioning + compliance rules)

Removed sections: none (template placeholders -> concrete content).

Template consistency check:
- [OK]    .specify/templates/plan-template.md — Constitution Check gate is derived
          from this file at plan time; compatible, no change required.
- [OK]    .specify/templates/spec-template.md — no mandated-section conflicts; compatible.
- [FIXED] .specify/templates/tasks-template.md — updated: prior "Tests are OPTIONAL"
          guidance reconciled with Principle V (tests MANDATORY for this project).
- [OK]    .claude/skills/commands — no stale agent-specific references requiring change.

Deferred TODOs: none. Ratification date set to first-adoption date (2026-05-31).
-->

# RyTask Constitution

## Core Principles

### I. Fixed Technology Stack

The stack is fixed and MUST NOT be substituted without a constitutional amendment:

- The backend MUST be NestJS, structured as a modular monolith.
- The frontend MUST be Next.js (App Router, React Server Components).
- Persistence MUST use Drizzle ORM over PostgreSQL 16+.
- Asynchronous work, caching, and realtime fan-out MUST use Redis 7+ with BullMQ.
- The workspace tooling MUST be pnpm workspaces + Turborepo; lint/format MUST be Biome.

Any change introducing an alternative framework, ORM, database, queue, or runtime for these
roles MUST be rejected unless this constitution is first amended.

Rationale: A single, opinionated stack keeps a self-hosted product operable by small teams and
keeps contributor onboarding, CI, and the one-command deploy story coherent. Substitution
fragments the project and breaks the self-host promise.

### II. Multi-Tenancy by Construction

Tenant isolation is structural, not advisory:

- Every tenant-scoped row MUST carry `organization_id`, and `workspace_id` where the entity is
  workspace-scoped, both `NOT NULL`.
- Every query against tenant-scoped data MUST be filtered by the active tenant. Raw, unscoped
  database access is FORBIDDEN; repositories MUST inherit tenant scoping (e.g.
  `TenantScopedRepository`) rather than re-implement the filter per call site.
- The active tenant MUST be resolved server-side from the authenticated principal, and MUST NOT
  be trusted from client-supplied body, query, or header parameters.
- Any code path that can read or write another tenant's data is a CRITICAL defect that MUST
  block release.
- Cross-tenant isolation MUST be asserted by automated tests for every tenant-scoped table.

Rationale: In a self-hosted multi-org product, a single missing tenant filter is a data-breach
class bug. The architecture must make the safe path the only path.

### III. Modular Monolith & Hexagonal Architecture

The codebase is one deployable with hard internal seams:

- The system MUST be organized into bounded contexts (modules) with explicit public contracts. A
  module MUST NOT import another module's repositories or reach into its tables; cross-module
  interaction MUST go through a published service contract or domain event.
- Each use case MUST be implemented as a single-responsibility provider
  (provider-per-operation), not bundled into fat catch-all services.
- All external I/O (database, Redis, Slack, GitHub, object storage, email, clock, ID generation)
  MUST sit behind ports (interfaces) with adapters at the edges, so domain logic is pure and
  unit-testable without infrastructure.
- The Drizzle schema MUST be the single source of truth for the data model.

Rationale: Hard boundaries plus ports/adapters keep the monolith extractable and keep the domain
fast to test — which is precisely what makes the testing principle affordable.

### IV. API <-> MCP Parity

The product is API-first and agent-operable:

- Every capability exposed through the REST API MUST be reachable through the MCP server:
  anything a human can do via the API, an AI agent MUST be able to do via MCP.
- The REST API and domain events ARE the contract. The web UI, Slack bot, MCP server, and
  integrations MUST be clients of that contract, never privileged back doors.
- Parity MUST be enforced by an automated contract/parity test. A service use case lacking a
  corresponding MCP tool MUST fail CI.

Rationale: Full-control MCP is a core differentiator. Parity can only be guaranteed if it is
mechanically verified, not maintained by discipline.

### V. Test-First & Enforced Coverage (NON-NEGOTIABLE)

Tests are a release gate, not a courtesy:

- Every feature MUST ship unit tests, integration tests, and contract tests. Integration tests
  MUST run against a real PostgreSQL instance (e.g. testcontainers), never against mocks.
- Flagship user flows MUST have end-to-end tests (Playwright).
- Required tests MUST be declared per module. CI MUST FAIL when a required test is missing — not
  only when an existing test fails.
- No change MUST merge unless all required tests pass AND coverage is at least 80% of lines and
  at least 70% of branches.

Rationale: Mocked persistence hides tenancy and SQL defects. Declaring required tests and failing
on their absence prevents silent erosion of the safety net.

### VI. Secure by Default

Authorization and secret handling are mandatory and centralized:

- Every API endpoint MUST enforce authorization with a server-side RBAC guard. There are no
  unprotected mutating endpoints, and client-side checks are never sufficient.
- Authorization decisions MUST be made on the server from the authenticated principal and the
  resolved tenant.
- Secrets and credentials MUST be supplied only via environment configuration. Secrets MUST NOT
  be hard-coded or committed to the repository.

Rationale: A self-hosted product is deployed by operators of varying sophistication. Safe
defaults must not depend on correct client behavior or per-deployment secret hygiene.

### VII. One-Command Self-Hosting

Self-hosting MUST be trivial:

- The entire stack (web, API, worker, PostgreSQL, Redis, and required supporting services) MUST
  start with a single `docker compose up`.
- The `api` and `worker` MUST share one codebase and one container image, differentiated only by
  entrypoint/configuration.
- A new deployment MUST reach a usable state without manual, undocumented steps beyond providing
  the required environment configuration.

Rationale: The product targets small teams without dedicated ops. If standing it up is hard, the
open-source / self-host promise fails the "Albert/Marissa test."

## Additional Engineering Constraints

These constraints reinforce the principles above and are binding:

- IDs MUST be sortable, externally safe identifiers (UUIDv7/ULID); timestamps MUST be
  `timestamptz`; soft-delete (`deleted_at`) MUST be used only where recovery is required.
- Every external webhook (Slack, GitHub) and every mutating public API call MUST be idempotent;
  background jobs MUST be safe to retry and replay.
- Formatting MUST follow Biome with repository settings (single quotes, 2-space indent,
  100-column width, trailing commas, LF line endings).
- Architecture invariants (module boundaries, tenant scoping, MCP parity, required tests) MUST be
  enforced by lint + architecture tests + CI, not by review convention alone.

## Development Workflow & Quality Gates

- Feature work MUST follow the Spec-Driven Development cycle: specify -> (clarify) -> plan ->
  tasks -> (analyze) -> implement, using the Spec Kit skills.
- The implementation plan for every feature MUST include a Constitution Check. Violations MUST be
  justified in a Complexity Tracking entry, or the design MUST be revised.
- CI MUST enforce, as blocking gates: required-test presence, all tests passing, coverage
  thresholds (Principle V), MCP parity (Principle IV), tenant-isolation tests (Principle II), and
  RBAC presence on endpoints (Principle VI).
- A pull request MUST NOT merge while any blocking gate fails. Reviewers MUST verify
  constitutional compliance as part of approval.

## Governance

- This constitution supersedes other practices and conventions. Where guidance conflicts, the
  constitution wins.
- Amendments MUST be proposed via a pull request that documents the change, its rationale, and
  any migration impact, and MUST be approved by a project maintainer.
- Versioning of this document follows semantic versioning: MAJOR for backward-incompatible
  governance/principle removals or redefinitions, MINOR for added or materially expanded
  principles/sections, and PATCH for clarifications and non-semantic refinements.
- Compliance MUST be reviewed on every pull request through the CI gates and the reviewer
  checklist above. Repeated or willful violations MUST block release until remediated.
- Runtime development guidance for contributors and AI agents lives in `CLAUDE.md` and
  `knowledge/ARCHITECTURE.md`; those documents MUST stay consistent with this constitution.

**Version**: 1.0.0 | **Ratified**: 2026-05-31 | **Last Amended**: 2026-05-31
