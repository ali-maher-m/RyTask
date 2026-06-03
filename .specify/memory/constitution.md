<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — one new principle added (VIII. Design System & Brand Fidelity)
and three existing sections materially expanded (Additional Engineering Constraints,
Development Workflow & Quality Gates, Governance). Purely additive: no principle was
removed, reworded, or renumbered; Principles I–VII are unchanged verbatim.

Principles (current set, 8):
- I.    Fixed Technology Stack                              (unchanged)
- II.   Multi-Tenancy by Construction                       (unchanged)
- III.  Modular Monolith & Hexagonal Architecture          (unchanged)
- IV.   API <-> MCP Parity                                 (unchanged)
- V.    Test-First & Enforced Coverage (NON-NEGOTIABLE)    (unchanged)
- VI.   Secure by Default                                  (unchanged)
- VII.  One-Command Self-Hosting                           (unchanged)
- VIII. Design System & Brand Fidelity                     (ADDED in 1.1.0)

Sections amended in 1.1.0 (additive only):
- Additional Engineering Constraints — appended a design-token-origin constraint.
- Development Workflow & Quality Gates — appended brand-fidelity / token-only gate.
- Governance — runtime-guidance sentence now also names `branding/`.

Removed sections: none.

Template / artifact consistency check (1.1.0):
- [UPDATED] .specify/templates/plan-template.md — Constitution Check now surfaces
            Principle VIII (token-only UI + brand invariants) explicitly.
- [OK]      .specify/templates/spec-template.md — no natural design-system slot;
            spec is scenario/requirement/success-criteria driven. No change required.
- [UPDATED] .specify/templates/tasks-template.md — Polish phase gained an optional
            brand-fidelity / design-token verification task for UI-bearing features.
            (Existing Principle-V test mandates from 1.0.0 retained.)
- [OK]      CLAUDE.md — already documents `branding/` (the "Branding & design system"
            section). No change required here.
- [FOLLOW-UP] knowledge/ARCHITECTURE.md — does not yet reference the design system;
            consider adding a pointer to `branding/` when ARCHITECTURE.md is next revised.

Deferred TODOs: none. Ratification date unchanged (2026-05-31); last amended 2026-06-03.

----- prior report (1.0.0, retained for history) -----
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification. Template placeholders replaced with concrete,
project-specific principles. First adoption, so MAJOR version 1.0.0.
Principles defined (initial set, 7): I Fixed Stack, II Multi-Tenancy, III Modular
Monolith & Hexagonal, IV API<->MCP Parity, V Test-First (NON-NEGOTIABLE), VI Secure
by Default, VII One-Command Self-Hosting. Added sections: Additional Engineering
Constraints, Development Workflow & Quality Gates, Governance. Removed: none.
tasks-template.md reconciled "Tests OPTIONAL" → MANDATORY (Principle V). Ratified
2026-05-31; no deferred TODOs.
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

### VIII. Design System & Brand Fidelity

The visual product is brand-governed, not improvised. All UI work (`apps/web`, `packages/ui`, and any
generated mocks/prototypes) MUST conform to the RyTask design system in `branding/`:

- `branding/colors_and_type.css` is the single source of truth for design tokens (color light+dark,
  type, spacing, radius, shadow, motion, layout). Product UI MUST reference ONLY the semantic
  `var(--*)` tokens. Raw palette primitives and hard-coded hex/px brand values are FORBIDDEN in
  product code. Tokens MUST flow from this file into `packages/ui`; values MUST NOT be copy-pasted
  around the codebase.
- Brand invariants MUST hold: Sunbeam yellow (`#ECB30A`) is the primary, and yellow/colored fills MUST
  carry DARK ink text (never white text on yellow); Honey (`#D98A0E`) is reserved for time/momentum;
  neutrals are the warm Stone scale; only three semantic hues (green/amber/red) plus one indigo for
  info/in-review are permitted — no teal, neon, or off-palette color. Light and dark MUST resolve from
  the same semantic token names.
- Typography MUST be Hanken Grotesk for UI, Schibsted Grotesk for brand moments only, and Geist Mono
  with `tabular-nums` for every figure (times, estimates, counts, IDs). Inter is explicitly avoided.
- The aesthetic MUST stay flat: NO decorative gradients, NO glassmorphism/frosted blur, NO floaty
  colored shadows, NO emoji as UI chrome. Small radii and 1px hairlines do the structural work, and
  elevation is a whisper. Motion MUST be fast and calm — no bounce/overshoot — and decorative motion
  MUST be disabled under `prefers-reduced-motion`.
- Copy and voice MUST be plain, kind, and jargon-free, passing the non-technical-teammate
  ("Albert/Marissa") test. Sentence case for everything human; `UPPERCASE` with `0.06em` tracking only
  for micro-labels.
- Accessibility is a hard floor: text and interactive UI MUST meet WCAG AA contrast — this is precisely
  WHY yellow fills take dark ink. Brand fidelity MUST NEVER override legibility.
- Production substitutions to resolve before GA: icons are Lucide-via-CDN (self-host a sprite for
  production), fonts are pulled from Google Fonts (confirm the cuts), and the logo is a v1 proposal
  open to iteration.

Rationale: The look-and-feel — calm warmth, honest in-row time meters, zero jargon — is a stated
product differentiator and the visible half of the non-technical-teammate promise. Consistency and
correct light/dark behavior are only guaranteed when UI is driven from one token source and checked
mechanically, not maintained by reviewer discipline or scattered hex values.

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
- Design tokens MUST originate from `branding/colors_and_type.css`. UI MUST NOT introduce off-token
  colors, fonts, or radii (no hard-coded brand hex/px, no non-system font families), and this MUST be
  enforceable by lint/CI rather than review convention.

## Development Workflow & Quality Gates

- Feature work MUST follow the Spec-Driven Development cycle: specify -> (clarify) -> plan ->
  tasks -> (analyze) -> implement, using the Spec Kit skills.
- The implementation plan for every feature MUST include a Constitution Check. Violations MUST be
  justified in a Complexity Tracking entry, or the design MUST be revised.
- CI MUST enforce, as blocking gates: required-test presence, all tests passing, coverage
  thresholds (Principle V), MCP parity (Principle IV), tenant-isolation tests (Principle II),
  RBAC presence on endpoints (Principle VI), and design-system conformance — token-only UI with no
  off-token colors/fonts/radii (Principle VIII).
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
  `knowledge/ARCHITECTURE.md`; the visual source of truth lives in `branding/` (notably
  `branding/README.md` and `branding/RyTask Style Sheet.html`, with tokens in
  `branding/colors_and_type.css`). Those documents MUST stay consistent with this constitution.

**Version**: 1.1.0 | **Ratified**: 2026-05-31 | **Last Amended**: 2026-06-03
