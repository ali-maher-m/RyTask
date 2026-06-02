# Implementation Plan: Identity, Tenancy & Onboarding (Milestone M0)

**Branch**: `002-identity-tenancy-onboarding` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-identity-tenancy-onboarding/spec.md`

## Summary

M0 delivers the **identity, access, and tenancy foundation**: a non-technical first-run wizard that
creates the initial **organization + owner + starter project**; **email+password authentication** with
short-lived access tokens and rotating, revocable refresh sessions; **email verification & password
reset** via single-use links; **invitations** (email + link) with role pre-assignment; built-in
**RBAC roles** (Owner/Admin/Member/Guest/Viewer) enforced server-side **default-deny on every route**;
**multi-tenant isolation** so no organization ever sees another's data; and scoped **Personal Access
Tokens** for API/MCP/CI access.

Technical approach (from `research.md`): M0 is a **retrofit, not a rebuild**. M1 was authored against
fixed seams the scaffold ships as **permissive stubs** — `AuthGuard`, `TenantGuard`, `RbacGuard`,
`ThrottleGuard`, and `resolveDevPrincipal` (research D0). M0 **populates those seams** with real
JWT/PAT verification, org-from-principal resolution + membership check into the already-real
`TenantContextService` (AsyncLocalStorage), and per-route role/permission enforcement — turning the
inert pipeline live without changing its shape. Two new bounded contexts follow the proven
`health`/`projects` pattern (provider-per-operation + tenant-scoped repository + ports/adapters):
**`identity`** (auth, sessions, PATs, verification/reset, `whoami`) and **`orgs`** (organizations &
settings, workspaces, memberships/roles, invitations, first-run onboarding, member administration).
The schema **extends** the shipped tenancy spine — `organizations.settings`, auth columns on `users` —
and **adds** `memberships`, `sessions`, `api_tokens`, `invitations`, and `one_time_tokens`. The closed
testing system (per-module `module.testplan.ts`, real ephemeral Postgres, contract tests) plus the
**cross-tenant isolation suite** and an **authorization matrix** gate the merge.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (pinned `.nvmrc`); pnpm 9.15.9 (corepack) — unchanged.

**Primary Dependencies**: NestJS 11, Next.js 15.1 (App Router/RSC), Drizzle ORM 0.38, BullMQ + Redis 7,
`@nestjs/event-emitter`, Zod (DTO/contract schemas), Biome 1.9.4, Turborepo 2. **New for M0**:
`@nestjs/jwt` (sign/verify access tokens), `argon2` (password + secret hashing, NFR-SEC-002), and
`@nestjs/throttler` (Redis store) for brute-force/rate limiting (§6.6). No new always-on service.

**Storage**: PostgreSQL 16 (system of record); Redis 7 (rate-limit/brute-force buckets, refresh/session
bookkeeping cache, idempotency). Email via the existing `Mailer` **port** (Mailhog in dev compose) for
verification/reset/invite messages — infrastructure, not a new dependency.

**Testing**: Vitest 2.1.8 (unit + integration against **real ephemeral Postgres** via
`apps/api/src/common/testing/postgres.ts`), supertest (contract), Playwright + axe (e2e/a11y).
Gates: `check-required-tests`, `check-mcp-parity`, dependency-cruiser boundaries (all already wired).
**New M0 test surfaces**: cross-tenant isolation suite over all tenant-scoped tables (FR-TEST-007), an
authorization matrix (role × route), token-rotation/replay, brute-force lockout, last-owner invariant,
invitation lifecycle, and a real-principal test helper that replaces the dev-header seam.

**Target Platform**: Linux server (Docker); `docker compose up` one-command stack (web :3000, api :3001,
postgres, redis, mailhog, minio). M0 keeps the one-command promise (Principle VII): first run reaches a
usable, owned workspace with no undocumented steps.

**Project Type**: Web application (monorepo: `apps/web` frontend + `apps/api` backend/worker, shared
`packages/*`). Extends the existing scaffold; no structural change.

**Performance Goals**: login/refresh p95 < 300 ms; token verification adds < 10 ms p50 to the hot path
(asymmetric-verifiable access token, no DB round-trip on the happy path); first-run wizard completes in
≤5 steps / under 3 minutes (SC-001).

**Constraints**: 0 cross-org leaks across the isolation suite (SC-008, Principle II); access-token TTL
≤15 min with refresh rotation invalidating the prior token 100% of the time (SC-003); passwords stored
only as argon2id hashes, no plaintext in storage/logs/URLs (SC-002, NFR-SEC-002); default-deny authZ on
every route (SC-005, Principle VI); reset/verify links single-use & time-limited with no email
enumeration (SC-010); org always retains ≥1 Owner (SC-007/SC-015). Coverage ≥80% line / ≥90%
domain+providers / ≥90% branch on domain policies (Principle V).

**Scale/Scope**: single org/workspace **in practice**, multi-tenant **by construction** (FR-TEN-003);
2 new backend modules (`identity`, `orgs`); 5 new tables + 2 extended; REST surface ~22 routes under
`/api/v1` (`/auth/*`, `/api-tokens`, `/orgs`, `/workspaces`, `/memberships`, `/invites`, `/setup`);
8 user stories (P1–P3).

**Downstream consumer**: **M1 (Core Work Loop)** is already implemented and **becomes mergeable once
M0 lands** — its tenancy-isolation and RBAC contract tests were authored against these seams and only
pass when M0 populates them (M1 research D0). M0 must therefore **not break the M1 contract**: it keeps
`users.organizationId`, `project_members`, `TenantScopedRepository`, and `TenantContextService` intact
and applies RBAC to existing M1 routes via their already-declared `x-rbac` matrix.

## Constitution Check

*GATE: re-checked after Phase 1 design — see "Post-Design Re-Check" below. Status: **PASS** with one
tracked, justified deviation (Complexity Tracking).*

M0 is the milestone that **satisfies** the two principles M1 could only defer to it (II and VI), so the
table below is where those guarantees move from "verified by M0" to "implemented by M0".

| Principle | M0 compliance | Status |
|---|---|---|
| **I. Fixed Tech Stack** | NestJS modular monolith, Next.js, Drizzle/PG16, Redis 7 + BullMQ, pnpm+Turbo, Biome. New deps (`@nestjs/jwt`, `argon2`, `@nestjs/throttler`) are libraries within the fixed stack, not substitutions. | ✅ PASS |
| **II. Multi-Tenancy by Construction** | `TenantGuard` resolves org **from the verified principal** (never from client input) + asserts membership, then establishes `TenantContextService` ALS so every repository auto-scopes. New tenant-scoped tables (`memberships`, `sessions`, `api_tokens`, `invitations`, `one_time_tokens`) carry `organization_id NOT NULL` with org-leading indexes; per-table tenancy-isolation tests + a cross-table isolation suite (FR-TEST-007, SC-008). **This milestone implements the guarantee M1 deferred.** | ✅ PASS (implemented here) |
| **III. Modular Monolith & Hexagonal** | New bounded contexts `identity` + `orgs`, each exposing a `*.contract.ts`; **provider-per-operation**; external I/O behind ports (`Mailer`, `Clock`, `IdGenerator`, Redis); Drizzle SSOT. Boundaries enforced by dependency-cruiser. | ✅ PASS |
| **IV. API ↔ MCP Parity** | M0 domain capabilities (whoami, workspace context, org settings, membership/invite/role mgmt, PAT mgmt) registered + matched 1:1 with MCP tool **definitions** (`contracts/mcp-tools.md`), keeping `check-mcp-parity` green. Credential-acquisition flows (login/register/refresh/logout/verify/reset) are **excluded by design** (research D11) — MCP authenticates by PAT, not by logging in. **MCP transport remains deferred** → Complexity Tracking C1. | ⚠️ PASS w/ deviation |
| **V. Test-First & Enforced Coverage** | `module.testplan.ts` for `identity` + `orgs` (provider integration vs **real Postgres**, controller contract, domain-policy unit, per-table tenancy); cross-tenant isolation suite + authz matrix; sign-up→invite→accept→RBAC Playwright e2e; coverage at constitution thresholds. | ✅ PASS |
| **VI. Secure by Default** | RBAC guard enforced **default-deny on every route** from the server-side principal + resolved tenant; argon2id hashing; signed tokens with refresh rotation + reuse detection; brute-force throttling; secrets via env only. **This milestone implements the guarantee M1 deferred.** | ✅ PASS (implemented here) |
| **VII. One-Command Self-Hosting** | No new always-on service (rate-limit uses existing Redis; email uses the existing Mailer port/Mailhog). `api`+`worker` share one image. `docker compose up` → first-run wizard → usable owned workspace; seed yields a verified Owner so the demo path is unchanged. | ✅ PASS |

**Scope deferrals (not principle violations), tracked to v2/v3 per the spec's Out of Scope**: the
append-only **audit log** (FR-AUTH-009, FR-RBAC-008) — M0 emits domain events as the seam; the full
**GDPR hard-purge + export** pipeline (FR-TEN-006) — M0 ships the Owner-only delete *action* as a
soft-delete; OAuth/SAML/SCIM/MFA, multi-workspace, and custom roles.

## Project Structure

### Documentation (this feature)

```text
specs/002-identity-tenancy-onboarding/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D0–D17
├── data-model.md        # Phase 1 — enums + 5 new / 2 extended tables, state machines
├── quickstart.md        # Phase 1 — run/seed/test the M0 slice; replacing the dev-header seam
├── contracts/           # Phase 1 — REST OpenAPI, RBAC matrix, MCP catalog
│   ├── README.md
│   ├── openapi.yaml
│   ├── rbac-matrix.md
│   └── mcp-tools.md
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root — extends the existing scaffold)

```text
apps/
  api/                                   # NestJS (api + worker, one image)
    src/
      common/                            # EXISTING — M0 POPULATES the stub seams
        auth/principal.ts                # EXTEND — drop dev-header resolver from runtime; add role/scopes
        guards/auth.guard.ts             # FILL — verify JWT/PAT, assert principal, honor @Public
        guards/tenant.guard.ts           # FILL — org-from-principal + membership check → ALS
        guards/rbac.guard.ts             # FILL — @RequirePermission/@Roles metadata, default-deny
        guards/throttle.guard.ts         # FILL — Redis buckets; stricter /auth/* + brute-force lockout
        tenancy/ (TenantContextService, TenantScopedRepository)   # REUSE — already real
        tenancy/tenant-context.middleware.ts   # EDIT — establish ALS from verified principal
        ports/ (Mailer, Clock, IdGenerator, Redis)   # REUSE
        rbac/ (permission catalog, @RequirePermission, @Public, @Roles decorators)   # NEW
        testing/ (postgres.ts, with-principal.ts test helper)     # EXTEND
      modules/
        identity/                        # NEW — auth & users (ARCHITECTURE §3.2)
          identity.module.ts | identity.contract.ts | module.testplan.ts
          controllers/ (auth.controller, api-tokens.controller, whoami.controller)
          providers/ (register, login, refresh, logout, verify-email, request-reset,
                      confirm-reset, issue-token, list-tokens, revoke-token)
          domain/ (password.policy, token.policy[rotation/family], scope.policy)
          repositories/ (users, sessions, api-tokens, one-time-tokens)
          services/ (auth.service, token-verifier.service, password-hasher [argon2 adapter])
          events/ (user-registered, user-logged-in, token-issued)
        orgs/                            # NEW — orgs/workspaces (ARCHITECTURE §3.2)
          orgs.module.ts | orgs.contract.ts | module.testplan.ts
          controllers/ (setup[first-run], orgs, workspaces, memberships, invites)
          providers/ (bootstrap-first-run, update-org-settings, soft-delete-org,
                      invite-member, accept-invite, revoke-invite, list-members,
                      set-member-role, remove-member, transfer-ownership)
          domain/ (role.policy, last-owner.policy, invitation.policy, bootstrap.policy)
          repositories/ (organizations, workspaces, memberships, invitations)
          services/ (orgs.service, membership.service, access.service[role resolution])
          events/ (member-invited, member-joined, role-changed)
      app.module.ts                      # EDIT — register identity+orgs; add RbacGuard + ThrottleGuard to APP_GUARD chain
  web/                                   # Next.js App Router (EXISTING shell)
    app/
      setup/                             # NEW — first-run wizard (Albert/Marissa test)
      (auth)/login | register | reset    # NEW — auth screens
      invite/[token]/                    # NEW — accept-invite landing
      settings/organization | members | tokens   # NEW — admin surfaces (US8, US7)
    e2e/                                 # NEW — signup→invite→accept→rbac.e2e.spec.ts (+ axe)
packages/
  db/src/
    enums.ts                             # EXTEND — role_type, token_type, one_time_token_purpose
    tables.ts                            # EXTEND — organizations.settings + users auth cols;
                                         #          add memberships, sessions, api_tokens, invitations, one_time_tokens
    seed.ts                              # EXTEND — founder gets argon2 passwordHash + verified + OWNER membership
    migrations/                          # NEW generated SQL (0002_*) via drizzle-kit generate
  contracts/src/
    identity.contract.ts | orgs.contract.ts          # NEW Zod DTOs
    mcp/registry.ts                      # EXTEND — M0 context/identity/org/member/token tool defs (parity)
  sdk/                                   # regenerate from OpenAPI
scripts/
  check-required-tests.ts | check-mcp-parity.ts      # EXISTING gates — extended (M0 capabilities)
```

**Structure Decision**: Reuse the existing monorepo (matches `knowledge/ARCHITECTURE.md` §16 and the
scaffold). The two new bounded contexts are NestJS modules under `apps/api/src/modules/<context>/`
following the `projects` module's shape. The decisive difference from M1 is that **M0 also edits the
shared `common/` seams** (`guards/`, `tenancy/middleware`, new `rbac/`), because populating those stubs
— not adding feature modules — is the heart of this milestone. Shared DTOs and the MCP registry live in
`packages/contracts`; the Drizzle schema stays the single source of truth in `packages/db/src/tables.ts`.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **C1 — MCP tool *definitions* present, MCP *transport* deferred** (Principle IV) | Continues M1's C1. The MCP **server** is its own later milestone, but Principle IV demands mechanically-verified parity now. Registering M0's domain capabilities (whoami, workspace context, org/member/token mgmt) as tool definitions keeps `check-mcp-parity` *truly* green and prevents surface drift, at near-zero cost. Credential-acquisition flows are excluded from the capability set by design (D11), so their absence is not a parity gap. | *Leave M0 capabilities out of the registry* → gate falsely green, silently violates Principle IV. *Ship full MCP transport in M0* → the spec scopes the MCP server out of M0 and would add PAT-session/dry-run test surface beyond the foundation. |

> The deviation is **tracked and time-boxed to the MCP milestone**; it weakens no CI gate (parity stays
> green; tenancy/RBAC/coverage gates are fully enforced for all M0 code). Audit-log and GDPR-purge are
> **scope deferrals** recorded in the spec's Out of Scope, with event seams emitted now — they are not
> principle violations and need no Complexity entry.

## Post-Design Re-Check (after Phase 1)

Re-evaluated against the data model and contracts: tenancy holds on all new tables and the resolution
path is server-side-only (II); module boundaries and provider-per-operation are reflected in the
structure and data-model ownership map (III); the parity catalog is complete and 1:1 for M0 domain
capabilities with the credential-acquisition exclusion documented (IV, deviation C1 tracked); every
`Must` requirement maps to a contract route + a declared required test (V); the RBAC matrix covers every
mutating route including the retrofit onto M1's routes (VI); no new always-on service was introduced and
first-run reaches a usable state in one command (VII). **Gate result: PASS.** Ready for `/speckit-tasks`.
