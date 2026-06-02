---
description: "Task list for Identity, Tenancy & Onboarding (Milestone M0)"
---

# Tasks: Identity, Tenancy & Onboarding (Milestone M0)

**Input**: Design documents from `/specs/002-identity-tenancy-onboarding/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓ (D0–D17), data-model.md ✓, contracts/ ✓ (openapi.yaml, rbac-matrix.md, mcp-tools.md), quickstart.md ✓

**Tests**: MANDATORY (RyTask Constitution Principle V — Test-First & Enforced Coverage). Every provider → an integration test vs **real ephemeral Postgres**; every controller route → a contract test; every domain policy/guard → unit tests; every tenant-scoped table → a tenancy-isolation spec; the cross-tenant suite + authorization matrix gate the merge. `check-required-tests` fails the build if a declared required test is **missing**, not only if it fails.

**This is a retrofit, not a rebuild** (research D0): M0 *populates* the permissive stub seams (`AuthGuard`, `TenantGuard`, `RbacGuard`, `ThrottleGuard`, `resolveDevPrincipal`) and adds two bounded contexts (`identity`, `orgs`) following the proven `projects`-module shape. It must **not break the M1 contract** (`users.organizationId`, `project_members`, `TenantScopedRepository`, `TenantContextService`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `US1`–`US8`; Setup/Foundational/Polish carry no story label
- File paths are exact and relative to the repo root

## Path conventions

- Backend: `apps/api/src/` (NestJS, api + worker one image) — new modules under `apps/api/src/modules/{identity,orgs}/`, shared seams under `apps/api/src/common/{guards,rbac,tenancy,auth,ports,testing}/`
- Schema (SSOT): `packages/db/src/{enums,tables,seed}.ts` + `packages/db/migrations/`
- Contracts/DTOs + MCP registry: `packages/contracts/src/`
- Frontend: `apps/web/app/` + `apps/web/e2e/`
- Gates: `scripts/check-required-tests.ts`, `scripts/check-mcp-parity.ts`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the M0 libraries (within the FIXED stack) and configuration the rest of the milestone needs.

- [X] T001 Add M0 runtime dependencies to `apps/api/package.json`: `@nestjs/jwt` (access-token sign/verify), `argon2` (password + secret hashing, NFR-SEC-002), `@nestjs/throttler` (Redis-backed rate limiting); run `pnpm install` and verify the workspace builds.
- [X] T002 [P] Add typed config in `apps/api/src/common/config/auth.config.ts` (and register via `ConfigModule`) for: access-token signing keypair (EdDSA/RS256) + TTL (≤15 min), refresh TTL, argon2id cost params, throttle/brute-force thresholds, and `allowPublicSignup` default `false` (research D8/D12). Document all keys in `apps/api/.env.example`.
- [X] T003 [P] Confirm Biome/tsconfig/dependency-cruiser presets in `packages/config/` admit the two new modules and `common/rbac/`; add any needed boundary entries so `identity`/`orgs` cannot import another module's repositories (Principle III). [Generic depcruise rules already cover new modules; no preset change needed.]

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared spine every user story builds on — schema, DTO contracts, ports, the permission vocabulary, the two module skeletons + their declared test plans, the cross-story repositories, the session-issuance primitive, the seed, and the real-principal test helper. The four guard *seams* stay live as stubs (still return `true`) and are wired into the chain here; each P1 story fills the logic.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema (SSOT — `packages/db`)

- [X] T004 Extend enums in `packages/db/src/enums.ts`: `roleEnum` (`role_type`: OWNER/ADMIN/MEMBER/GUEST/VIEWER), `tokenTypeEnum` (`token_type`: PAT/OAUTH/MCP), `oneTimeTokenPurposeEnum` (`one_time_token_purpose`: EMAIL_VERIFY/PASSWORD_RESET). Leave the M1 `projectRoleEnum` unchanged (data-model §1).
- [X] T005 Extend `organizations` in `packages/db/src/tables.ts`: add `settings jsonb NOT NULL default {}` (typed `OrgSettings`) and `deletedAt timestamptz` (soft-delete, D14); define + export the `OrgSettings` type (timezone/locale/weekStart/workingDays/workingHours/logoUrl/allowPublicSignup) from `packages/db` (data-model §2.1). **Do not drop or retype existing columns** (M1 compatibility, D0/D1).
- [X] T006 Extend `users` in `packages/db/src/tables.ts`: add `passwordHash text`, `emailVerifiedAt timestamptz`, `deactivatedAt timestamptz`; keep `organizationId`, `users_org_idx`, and `users_org_email_unique` intact (M1 depends on them — data-model §2.2).
- [X] T007 Add the five new tenant-scoped tables to `packages/db/src/tables.ts` — `memberships`, `sessions`, `api_tokens`, `invitations`, `one_time_tokens` — each with `organizationId NOT NULL` and a composite index **leading on `organization_id`** (ADR-002), plus the indexes named in data-model §3 (`memberships_org_user_unique`, `sessions_token_hash_idx`/`sessions_family_idx`, `api_tokens_token_hash_idx`, `invitations_token_hash_idx`, `ott_token_hash_idx`).
- [X] T008 Generate the additive migration `packages/db/migrations/0002_*` via `pnpm --filter @rytask/db drizzle-kit generate`; hand-add the partial unique index on `invitations (organization_id, lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL AND email IS NOT NULL` (data-model §3.4/§6). Verify it is **drop-free / retype-free** against `0000`/`0001`.

### Contracts / DTOs (`packages/contracts`)

- [X] T009 [P] Create `packages/contracts/src/identity.contract.ts` — Zod DTOs + inferred types for `register`, `login` (+ `LoginResponse` tokens), `refresh`, `logout`, `verify-email`, `request/confirm password-reset`, `whoami` response, and `create/list/revoke api-token` (secret-shown-once response) per `contracts/openapi.yaml`.
- [X] T010 [P] Create `packages/contracts/src/orgs.contract.ts` — Zod DTOs for `setup` (first-run), `org` + `OrgSettings` (re-exported from `@rytask/db`), `update-org-settings`, `transfer-ownership`, `workspace` (response/list), `membership` (response/list), `set-member-role`, `invite` (email|link + role), `invite-preview`, `accept-invite`, `invite-list`.
- [X] T011 Export the two new contracts from `packages/contracts/src/index.ts` (after T009, T010) and regenerate the OpenAPI build if wired.

### Shared seam primitives (`apps/api/src/common`)

- [X] T012 [P] Add the `PasswordHasher` port in `apps/api/src/common/ports/password-hasher.port.ts` + an argon2id adapter (`apps/api/src/common/ports/argon2-hasher.adapter.ts`), registered in `ports.module.ts` (research D2; used by US1/US2/US6/US7).
- [X] T013 [P] Extend `apps/api/src/common/auth/principal.ts`: add `role` and `scopes` to `Principal`; move `resolveDevPrincipal` into a **test-only** module under `apps/api/src/common/testing/` (kept out of the runtime path — research D16). Do not change the existing field shape M1 consumes.
- [X] T014 [P] Create the permission catalog in `apps/api/src/common/rbac/permissions.ts` mapping each `role_type` to its permission set exactly per `contracts/rbac-matrix.md` (`self`, `tokens:*`, `org:read`, `workspace:read`, `members:*`, `org:settings:write`, `org:delete`/`org:transfer` Owner-only).
- [X] T015 [P] Create the RBAC decorators in `apps/api/src/common/rbac/decorators.ts`: `@RequirePermission('resource:action')`, `@Public()`, `@Roles(...)`, with their metadata keys (research D6). Vocabulary only — enforcement is filled in US4.

### Module skeletons + session-issuance primitive

- [X] T016 [P] Scaffold the `identity` module: `apps/api/src/modules/identity/identity.module.ts` + `identity.contract.ts` (public service interface) following the `projects` module shape.
- [X] T017 [P] Scaffold the `orgs` module: `apps/api/src/modules/orgs/orgs.module.ts` + `orgs.contract.ts` (incl. an `AccessService`/`memberships.contract.ts` surface for cross-context role reads — data-model §4) following the `projects` module shape.
- [X] T018 [P] Add the `TokenSigner` service in `apps/api/src/modules/identity/services/token-signer.service.ts` — sign/verify the asymmetric access JWT (`sub`, `org`, optional `wsp`, token version; TTL ≤15 min) with no DB hit (research D3). Pure, behind config from T002.
- [X] T019 [P] Implement the auth-aware `users` repository in `apps/api/src/modules/identity/repositories/users.repository.ts` (find-by-email, create, set password hash, mark verified/deactivated) on `TenantScopedRepository`.
- [X] T020 [P] Implement the `sessions` repository in `apps/api/src/modules/identity/repositories/sessions.repository.ts` (create, find-by-refresh-hash, rotate, revoke, revoke-family) on `TenantScopedRepository`.
- [X] T021 [P] Implement the `organizations` repository in `apps/api/src/modules/orgs/repositories/organizations.repository.ts` (read/settings/soft-delete) on `TenantScopedRepository`.
- [X] T022 [P] Implement the `workspaces` repository in `apps/api/src/modules/orgs/repositories/workspaces.repository.ts` (create, list, get) on `TenantScopedRepository`.
- [X] T023 [P] Implement the `memberships` repository in `apps/api/src/modules/orgs/repositories/memberships.repository.ts` (create, list, find-by-user, set-role, count-owners, deactivate) on `TenantScopedRepository`.
- [X] T024 Add `AuthService.issueSession(...)` in `apps/api/src/modules/identity/services/auth.service.ts` — mint a signed access token (TokenSigner) + an opaque refresh token (argon2-hashed, persisted via the sessions repo with a `familyId`), the shared primitive US1 bootstrap and US2 login both call (research D3).

### Wiring, declared test plans, seed, and the real-principal helper

- [X] T025 Register `IdentityModule` + `OrgsModule` in `apps/api/src/app.module.ts` and add `RbacGuard` + `ThrottleGuard` to the `APP_GUARD` chain after `AuthGuard`/`TenantGuard` (guards remain permissive stubs here; each P1 story fills its logic).
- [X] T026 [P] Declare the full required-test plan in `apps/api/src/modules/identity/module.testplan.ts` (providers, controllers+routes, policies `password`/`token`/`scope`, mcpTools, tenantScopedTables `users`/`sessions`/`api_tokens`/`one_time_tokens`, and every `requiredTests` entry) so `check-required-tests` demands them (Principle V).
- [X] T027 [P] Declare the full required-test plan in `apps/api/src/modules/orgs/module.testplan.ts` (providers, controllers+routes, policies `role`/`last-owner`/`invitation`/`bootstrap`, mcpTools, tenantScopedTables `organizations`/`workspaces`/`memberships`/`invitations`).
- [X] T028 [P] Add the `withPrincipal()` test helper in `apps/api/src/common/testing/with-principal.ts` — mints a **real** access token (or sets a verified principal) for a seeded user, replacing the dev-header seam in tests (research D16).
- [X] T029 Update `packages/db/src/seed.ts` so the seeded founder gets an argon2 `passwordHash` (known dev password), `emailVerifiedAt`, and an `OWNER` `membership` in `SEED_ORG_ID`, keeping `docker compose up` a working signed-in-Owner demo (research D16).

**Checkpoint**: Schema migrates, contracts/DTOs compile, both modules load with stub guards, repositories + session primitive exist, test plans are declared (gate now demands the story tests), and `withPrincipal()` is available. User stories can begin.

---

## Phase 3: User Story 1 — Stand up a new instance and create the organization (Priority: P1) 🎯 MVP

**Goal**: A fresh instance routes to a plain-language first-run wizard that atomically creates the organization (+ seeded `settings`), the owner account (argon2, auto-verified), the owner `OWNER` membership, the default workspace, and a starter project with the six categorized statuses — and the owner lands signed in. After bootstrap, `/setup` is closed (409). (FR-AUTH-010, FR-TEN-004; runs against the still-stubbed guards, which US2/US4/US5 then make real.)

**Independent Test**: Point a clean instance at an empty DB, open the app, complete the wizard in ≤5 steps; assert exactly one org/owner/workspace/starter-project with seeded defaults exist, the owner is signed in, dates render in the org timezone, and a second `GET /setup` returns "already set up" (routes to login).

### Tests for User Story 1 (MANDATORY — Constitution Principle V) ⚠️

> Write these first; ensure they FAIL before implementation.

- [X] T030 [P] [US1] Unit test for the bootstrap gate in `apps/api/src/modules/orgs/domain/bootstrap.policy.spec.ts` (first-run available iff zero orgs; closed afterward).
- [X] T031 [P] [US1] Integration test (real Postgres) for the first-run provider in `apps/api/src/modules/orgs/providers/bootstrap-first-run.provider.int.spec.ts` (atomic org+owner+membership+workspace+starter-project+statuses; idempotent re-run → 409).
- [X] T032 [P] [US1] Contract test for `apps/api/src/modules/orgs/controllers/setup.controller.contract.spec.ts` (`GET /setup`, `POST /setup`; 409 after bootstrap).
- [X] T033 [P] [US1] Tenancy-isolation spec for `memberships` in `apps/api/src/modules/orgs/repositories/memberships.tenancy.spec.ts`.
- [ ] T034 [P] [US1] Playwright + axe e2e for the wizard in `apps/web/e2e/setup.e2e.spec.ts` (≤5 steps to a usable, owned workspace; no jargon — SC-001).

### Implementation for User Story 1

- [X] T035 [P] [US1] Implement `BootstrapPolicy` (org-count gate) in `apps/api/src/modules/orgs/domain/bootstrap.policy.ts` (research D7).
- [X] T036 [US1] Implement `bootstrap-first-run.provider.ts` in `apps/api/src/modules/orgs/providers/` — atomic create of org(+default `settings`), owner (argon2 via PasswordHasher, `emailVerifiedAt` set), `OWNER` membership, default workspace, and a starter project by reusing M1's project-create + `seed-default-statuses`, then `AuthService.issueSession` so the owner is signed in (depends on T024, T035, M1 `seed-default-statuses`).
- [X] T037 [P] [US1] Implement `get-org` + `list/get-workspaces` providers in `apps/api/src/modules/orgs/providers/` (read seeded org settings; list/get workspace) for AC4 and the "land in workspace" step.
- [X] T038 [US1] Implement `SetupController` in `apps/api/src/modules/orgs/controllers/setup.controller.ts` (`@Public` `GET /setup` + `POST /setup`, gated by `BootstrapPolicy` → 409) and wire `OrgsService` (depends on T036).
- [X] T039 [US1] Implement `OrgsController` `GET /orgs/current` + `WorkspacesController` `GET /workspaces` / `GET /workspaces/{id}` in `apps/api/src/modules/orgs/controllers/`, annotated `@RequirePermission('org:read')` / `'workspace:read'` (catalog from T014/T015; enforcement arrives in US4).
- [X] T040 [US1] Emit the `OrganizationCreated`/`first-run` domain event from the bootstrap provider via `@nestjs/event-emitter` (audit seam, research D15).
- [ ] T041 [P] [US1] Build the first-run wizard UI in `apps/web/app/setup/` (name, email, password, org name → usable workspace; Albert/Marissa-test copy, no jargon).

**Checkpoint**: A clean instance bootstraps to a signed-in Owner with a starter project; `/setup` self-closes. US1 is demonstrable independently against stub guards.

---

## Phase 4: User Story 2 — Sign in and stay signed in securely (Priority: P1)

**Goal**: Email+password sign-in issues a short-lived access token + a rotating, revocable refresh token; refresh rotates and invalidates the prior token (reuse ⇒ revoke the family); logout revokes the session; brute-force is throttled; no secret ever appears in storage/logs/URLs. **This story makes the pipeline live**: `AuthGuard` asserts a verified principal, the tenant middleware resolves the principal from the verified token, and `ThrottleGuard` enforces Redis buckets. (FR-AUTH-001/002, NFR-SEC-001/002, SC-002/003/011.)

**Independent Test**: Sign in a seeded user; confirm an authenticated session that survives reload; expire the access token and confirm silent refresh with a rotated token while the old one is rejected; replay a rotated refresh token and confirm the family is revoked; sign out and confirm rejection; exceed the failed-login threshold and confirm throttling; inspect storage/logs and confirm only argon2 hashes (no plaintext/credentials).

### Tests for User Story 2 (MANDATORY — Constitution Principle V) ⚠️

- [X] T042 [P] [US2] Unit test in `apps/api/src/modules/identity/domain/password.policy.spec.ts` (strength/verify rules).
- [X] T043 [P] [US2] Unit test in `apps/api/src/modules/identity/domain/token.policy.spec.ts` (rotation + family reuse-detection → theft → family revoke).
- [X] T044 [P] [US2] Integration test in `apps/api/src/modules/identity/providers/login.provider.int.spec.ts` (login → access+refresh; refresh rotates + invalidates prior; logout revokes; reuse rejected — SC-003).
- [X] T045 [P] [US2] Contract test in `apps/api/src/modules/identity/controllers/auth.controller.contract.spec.ts` (`/auth/register|login|refresh|logout|whoami`; invalid creds → generic 401, no enumeration).
- [X] T046 [P] [US2] Tenancy-isolation spec for `sessions` in `apps/api/src/modules/identity/repositories/sessions.tenancy.spec.ts`.
- [ ] T047 [P] [US2] Integration test in `apps/api/src/modules/identity/providers/brute-force.int.spec.ts` (failed-login lockout per `(email, IP)` after threshold — SC-011).
- [ ] T048 [P] [US2] Security test in `apps/api/src/common/testing/no-secrets-in-logs.spec.ts` (no plaintext password/access/refresh token in storage, logs, or URLs — SC-002).

### Implementation for User Story 2

- [X] T049 [P] [US2] Implement `PasswordPolicy` in `apps/api/src/modules/identity/domain/password.policy.ts` and `TokenPolicy` (rotation + family reuse) in `apps/api/src/modules/identity/domain/token.policy.ts` (research D3).
- [X] T050 [US2] Implement the `TokenVerifier` service in `apps/api/src/modules/identity/services/token-verifier.service.ts` — verify a bearer JWT **or** PAT, resolve the owning user's principal (role from memberships via the orgs `AccessService` contract), reject expired/revoked, stamp PAT `lastUsedAt` (research D4/D5).
- [X] T051 [US2] Extend `AuthService` (`apps/api/src/modules/identity/services/auth.service.ts`) with `register`, `login` (verify hash, issueSession), `refresh` (rotate via TokenPolicy, family-reuse → revoke), `logout` (revoke session/family) (depends on T024, T049, T050).
- [X] T052 [P] [US2] Implement the `register`, `login`, `refresh`, `logout` providers in `apps/api/src/modules/identity/providers/`.
- [X] T053 [US2] Implement `AuthController` in `apps/api/src/modules/identity/controllers/auth.controller.ts` (`@Public` `POST /auth/register|login|refresh`; `@RequirePermission('self')` `POST /auth/logout`) + a `WhoamiController` `GET /auth/whoami` (`'self'`) returning principal/role/scopes/workspaces (FR-INT-MCP-001).
- [X] T054 [US2] **Fill `AuthGuard`** (`apps/api/src/common/guards/auth.guard.ts`): reject when no verified principal (401) unless `@Public()`; honor the decorator metadata from T015.
- [X] T055 [US2] **Edit `TenantContextMiddleware`** (`apps/api/src/common/tenancy/tenant-context.middleware.ts`): verify the bearer credential via `TokenVerifier`, set `req.principal`, and wrap the downstream in `tenant.run({...})`; **remove the `resolveDevPrincipal` runtime fallback** (research D4/D16).
- [X] T056 [US2] **Fill `ThrottleGuard`** (`apps/api/src/common/guards/throttle.guard.ts`): Redis token buckets keyed by principal/IP, **stricter on `/auth/*`**, plus the failed-login lockout from T047 (research D12).
- [X] T057 [US2] Migrate existing **M1** integration/contract tests off the dev header to `withPrincipal()` (T028) across `apps/api/src/modules/*/**.spec.ts`, adding project-role fixtures where a test asserts the non-admin fallback (quickstart §5). Confirm the M1 suite is green under genuine auth.
- [X] T058 [P] [US2] Emit `UserRegistered` / `UserLoggedIn` events in `apps/api/src/modules/identity/events/` (audit seam, D15).
- [ ] T059 [P] [US2] Build the `login` + `register` screens in `apps/web/app/(auth)/` with silent token refresh.

**Checkpoint**: Sessions are real and secure; the whole app now requires a verified principal (401 otherwise); M1 + M0 suites pass under genuine auth.

---

## Phase 5: User Story 3 — Invite teammates and assign their role (Priority: P1)

**Goal**: An Owner/Admin invites by email or shareable link with a pre-assigned role; the invitee accepts (registering/signing in as needed) and lands as a member at exactly that role. Expired/used/revoked invites cannot be redeemed; an invite for an existing member creates no duplicate. (FR-AUTH-011, SC-004.)

**Independent Test**: Invite an email with a chosen role and create a link with a chosen role; accept each; confirm membership at the pre-assigned role and that an expired/used/revoked invite is refused with no membership side-effect.

### Tests for User Story 3 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T060 [P] [US3] Unit test in `apps/api/src/modules/orgs/domain/invitation.policy.spec.ts` (state machine pending→accepted/revoked/expired; idempotent for an existing member — US3 AC3/AC4).
- [ ] T061 [P] [US3] Integration test in `apps/api/src/modules/orgs/providers/invite.provider.int.spec.ts` (email + link invite → accept → membership at role; expired/used/revoked → refused, no membership — SC-004).
- [ ] T062 [P] [US3] Contract test in `apps/api/src/modules/orgs/controllers/invites.controller.contract.spec.ts` (`POST/GET /invites`, public `GET /invites/{token}` + `POST /invites/{token}/accept`, `DELETE /invites/{id}/_revoke`).
- [ ] T063 [P] [US3] Tenancy-isolation spec for `invitations` in `apps/api/src/modules/orgs/repositories/invitations.tenancy.spec.ts`.

### Implementation for User Story 3

- [ ] T064 [P] [US3] Implement `InvitationPolicy` in `apps/api/src/modules/orgs/domain/invitation.policy.ts` (research D8).
- [ ] T065 [P] [US3] Implement the `invitations` repository in `apps/api/src/modules/orgs/repositories/invitations.repository.ts` (create, find-by-token-hash, list-pending, revoke, mark-accepted) on `TenantScopedRepository`.
- [ ] T066 [US3] Implement the `invite-member` (email via `Mailer` port + shareable link), `accept-invite` (create user/membership at role; idempotent), `revoke-invite`, and `list-invites` providers in `apps/api/src/modules/orgs/providers/` (depends on T064, T065).
- [ ] T067 [US3] Implement `InvitesController` in `apps/api/src/modules/orgs/controllers/invites.controller.ts` — `@RequirePermission('members:invite')` on create/revoke, `'members:read'` on list, `@Public()` on preview + accept (token-bearing).
- [ ] T068 [P] [US3] Emit `MemberInvited` / `MemberJoined` events in `apps/api/src/modules/orgs/events/` (audit seam, D15).
- [ ] T069 [P] [US3] Build the accept-invite landing in `apps/web/app/invite/[token]/` (preview role + org, then register/sign-in to join — non-technical, no training).

**Checkpoint**: A teammate can be invited (email or link) and lands at the pre-assigned role; bad invites are refused cleanly.

---

## Phase 6: User Story 4 — Roles decide what each person can do, enforced everywhere (Priority: P1)

**Goal**: `RbacGuard` enforces the per-route required permission **server-side, default-deny**, from the verified principal — across every M0 route **and** the retrofitted M1 routes. Viewer is read-only (mutations → 403); Owner-only actions require OWNER; org Owner/Admin (`isOrgAdmin`) bypass project-role checks, else defer to M1's `ProjectAccessService`. (FR-RBAC-001/002/003/007, NFR-SEC-003, SC-005/006/007.)

**Independent Test**: For each built-in role, drive a representative set of read/mutating actions **directly against the API** (bypassing the UI) and confirm allowed succeed / disallowed return 403; confirm identical outcomes via token vs UI; confirm a role change takes effect on the next action without re-auth.

### Tests for User Story 4 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T070 [P] [US4] Unit test in `apps/api/src/modules/orgs/domain/role.policy.spec.ts` (role→permission resolution incl. Viewer read-only and Owner-only, matching `rbac-matrix.md`).
- [ ] T071 [P] [US4] Unit test in `apps/api/src/common/rbac/rbac.guard.spec.ts` (default-deny when no satisfiable permission; `@Public` bypass; `@Roles` honored).
- [ ] T072 [US4] Authorization-matrix test in `apps/api/src/common/testing/authz-matrix.spec.ts` — role × representative route over M0 **and** M1 surfaces, asserting every row of both tables in `rbac-matrix.md` (Viewer-mutation 403, Owner-only 403/409 — SC-005/006/007). (Depends on US1/US2/US3 routes.)
- [ ] T073 [P] [US4] Flagship Playwright + axe e2e in `apps/web/e2e/signup-invite-accept-rbac.e2e.spec.ts` (sign up → invite → accept → role-gated actions — research D17).

### Implementation for User Story 4

- [ ] T074 [P] [US4] Implement `RolePolicy` in `apps/api/src/modules/orgs/domain/role.policy.ts` (research D6).
- [ ] T075 [US4] Implement the `AccessService` (role resolution + `isOrgAdmin`) in `apps/api/src/modules/orgs/services/access.service.ts`, exposed via the orgs contract for cross-context reads (data-model §4) — used by the guard and `TokenVerifier`.
- [ ] T076 [US4] **Fill `RbacGuard`** (`apps/api/src/common/guards/rbac.guard.ts`): read `@RequirePermission`/`@Roles` metadata, resolve the principal's permissions via `RolePolicy`/`AccessService`, **default-deny**, apply the org-admin bypass / project-role fallback to M1 routes (research D6). (Scope∩role for PATs is layered in US7.)
- [ ] T077 [US4] Retrofit `@RequirePermission` onto the existing **M1** controllers per `rbac-matrix.md` §"Retrofit": `projects`, `statuses`, `work-items`, `labels`, `comments`, `views`, `search`, `notifications` controllers under `apps/api/src/modules/*/controllers/`.
- [ ] T078 [US4] Emit `RoleChanged` event scaffolding in `apps/api/src/modules/orgs/events/` (consumed when role changes land in US8; audit seam D15).

**Checkpoint**: Every route is default-deny and role-enforced server-side; the authorization matrix and flagship e2e pass; M1 routes are now genuinely RBAC-gated.

---

## Phase 7: User Story 5 — One organization never sees another's data (Priority: P1, cross-cutting)

**Goal**: `TenantGuard` resolves the org **only** from the verified principal and asserts active membership; every read/list/search/get-by-id is auto-scoped; a cross-org id is 404 (existence never leaked). Single-org runs end-to-end; enabling a second org needs no migration. (FR-TEN-001/003, FR-TEST-007, SC-008/009; Principle II.)

**Independent Test**: Seed two orgs with overlapping-looking data; as a user of A exercise every access category (list/get/search/related traversal/direct-id) and confirm 0 B-rows returned or affected; reference a B resource by id and get 404; run a single-org flow end-to-end and diff the schema to confirm no migration is needed for a 2nd org.

### Tests for User Story 5 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T079 [US5] Cross-tenant isolation **suite** in `apps/api/src/common/testing/tenant-isolation.suite.spec.ts` — two orgs under **real principals** (`withPrincipal()`), asserting every M0 **and** M1 read/list/search/get-by-id as A returns/affects 0 B-rows (FR-TEST-007, SC-008).
- [ ] T080 [P] [US5] Integration test in `apps/api/src/common/testing/cross-tenant-id-probe.spec.ts` (referencing another org's resource by id → 404, never 403/leak — contracts README error table).
- [ ] T081 [P] [US5] Single-org end-to-end + no-migration assertion test in `apps/api/src/common/testing/single-org-no-migration.spec.ts` (FR-TEN-003, SC-009).

### Implementation for User Story 5

- [ ] T082 [US5] **Fill `TenantGuard`** (`apps/api/src/common/guards/tenant.guard.ts`): assert the principal is an active member of the resolved org and that an ALS context is present (established by the middleware in T055); 401/403 otherwise (research D10). Org is **never** read from body/query/header (Principle II).
- [ ] T083 [P] [US5] Audit/confirm org-leading composite indexes on all five new tables (T007) and that each tenant-scoped repo extends `TenantScopedRepository` with no raw/unscoped Drizzle access (Principle II); fix any gaps.

**Checkpoint**: Cross-tenant isolation is proven across M0 + M1; single-org works with the boundary fully enforced; a second org needs no schema change.

---

## Phase 8: User Story 6 — Recover access and verify identity (Priority: P2)

**Goal**: Single-use, time-limited email links for password reset and email verification; reset for an unknown email is indistinguishable from a known one (no enumeration); unverified accounts are gated per org policy. (FR-AUTH-003, SC-010.)

**Independent Test**: Request a reset, complete it via the emailed link, confirm the old password fails and the new works; confirm the link is rejected on a second use and after expiry; verify a new account and confirm verified status + lifted restrictions; confirm a reset for an unknown email returns the same response as a known one.

### Tests for User Story 6 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T084 [P] [US6] Integration test in `apps/api/src/modules/identity/providers/password-reset.provider.int.spec.ts` (single-use + expiry rejection; unknown-email uniform response — SC-010).
- [ ] T085 [P] [US6] Contract test in `apps/api/src/modules/identity/controllers/auth-recovery.controller.contract.spec.ts` (`/auth/verify-email`, `/auth/request-password-reset`, `/auth/confirm-password-reset`).
- [ ] T086 [P] [US6] Tenancy-isolation spec for `one_time_tokens` in `apps/api/src/modules/identity/repositories/one-time-tokens.tenancy.spec.ts`.

### Implementation for User Story 6

- [ ] T087 [P] [US6] Implement the `one_time_tokens` repository in `apps/api/src/modules/identity/repositories/one-time-tokens.repository.ts` (issue, find-by-hash, consume; purpose enum) on `TenantScopedRepository` (research D9).
- [ ] T088 [US6] Implement the `verify-email`, `request-password-reset` (uniform response), and `confirm-password-reset` providers in `apps/api/src/modules/identity/providers/`, sending links via the `Mailer` port (depends on T087, T051).
- [ ] T089 [US6] Add the three recovery routes to `AuthController` (or a sibling `AuthRecoveryController`) under `apps/api/src/modules/identity/controllers/`, all `@Public()`, with the org unverified-user policy applied.
- [ ] T090 [P] [US6] Build the `reset` / `verify` screens in `apps/web/app/(auth)/reset/` (request + confirm new password).

**Checkpoint**: Reset and verification work via single-use, time-limited links with no account enumeration.

---

## Phase 9: User Story 7 — Let tools and AI agents act on my behalf (Priority: P2)

**Goal**: A user mints a scoped Personal Access Token (secret shown once, stored only as a hash) that authenticates non-UI calls; effective permission = token scope ∩ holder's role; tokens are revocable and record `lastUsedAt`. (FR-AUTH-007, FR-RBAC-009 coarse-grained, SC-012.)

**Independent Test**: Mint a token with a limited scope; use it in-scope (succeeds) and out-of-scope (403) and for an action the role disallows (403, even if scope allows); revoke it and confirm rejection; confirm `lastUsedAt` is recorded.

### Tests for User Story 7 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T091 [P] [US7] Unit test in `apps/api/src/modules/identity/domain/scope.policy.spec.ts` (effective = scope ∩ role; out-of-scope or beyond-role → denied — SC-012).
- [ ] T092 [P] [US7] Integration test in `apps/api/src/modules/identity/providers/api-tokens.provider.int.spec.ts` (mint→hash-at-rest+shown-once; in/out-of-scope; revoke rejects; `lastUsedAt` stamped).
- [ ] T093 [P] [US7] Contract test in `apps/api/src/modules/identity/controllers/api-tokens.controller.contract.spec.ts` (`GET/POST /api-tokens`, `DELETE /api-tokens/{id}`).
- [ ] T094 [P] [US7] Tenancy-isolation spec for `api_tokens` in `apps/api/src/modules/identity/repositories/api-tokens.tenancy.spec.ts`.

### Implementation for User Story 7

- [ ] T095 [P] [US7] Implement `ScopePolicy` in `apps/api/src/modules/identity/domain/scope.policy.ts` (research D5).
- [ ] T096 [P] [US7] Implement the `api_tokens` repository in `apps/api/src/modules/identity/repositories/api-tokens.repository.ts` (create, find-by-hash, list-own, revoke, stamp-last-used) on `TenantScopedRepository`.
- [ ] T097 [US7] Implement the `issue-token` (`rytask_pat_<random>`, returned once, argon2/keyed hash at rest), `list-tokens`, and `revoke-token` providers in `apps/api/src/modules/identity/providers/` (depends on T095, T096).
- [ ] T098 [US7] Implement `ApiTokensController` in `apps/api/src/modules/identity/controllers/api-tokens.controller.ts` (`@RequirePermission('tokens:read'|'tokens:write')`, `self`).
- [ ] T099 [US7] Extend `RbacGuard` (T076) with the **scope ∩ role** branch via `ScopePolicy` for PAT/MCP principals, and stamp `lastUsedAt` on use through `TokenVerifier` (T050); emit `TokenIssued` event in `apps/api/src/modules/identity/events/`.
- [ ] T100 [P] [US7] Build the token-management UI in `apps/web/app/settings/tokens/` (mint with scope, show-once secret, list, revoke, last-used).

**Checkpoint**: Scoped PATs authenticate non-UI calls bounded by scope ∩ role, are revocable, and record last-used.

---

## Phase 10: User Story 8 — Administer the organization and its members (Priority: P3)

**Goal**: Owner/Admin edit org settings (name/slug/logo/timezone/locale/week-start/working days+hours), list members, change roles, and remove members (revoking their sessions/tokens). Owner-only: transfer ownership and soft-delete the org. The org always retains ≥1 Owner. (FR-TEN-004, FR-RBAC-003, SC-007/015.)

**Independent Test**: Change each org setting and confirm persistence + effect (timezone re-renders dates); change a member's role and confirm permissions change next action; remove a member and confirm their access/sessions end; confirm only an Owner can transfer/delete and the last Owner cannot be removed or demoted.

### Tests for User Story 8 (MANDATORY — Constitution Principle V) ⚠️

- [ ] T101 [P] [US8] Unit test in `apps/api/src/modules/orgs/domain/last-owner.policy.spec.ts` (cannot remove/demote the last OWNER — SC-015).
- [ ] T102 [P] [US8] Integration test in `apps/api/src/modules/orgs/providers/member-admin.provider.int.spec.ts` (set-role; remove → sessions/tokens revoked; transfer-ownership atomic + attributable; last-owner guard → 409).
- [ ] T103 [P] [US8] Contract test in `apps/api/src/modules/orgs/controllers/member-admin.controller.contract.spec.ts` (`PATCH /orgs/current`, `DELETE /orgs/current`, `POST /orgs/current/transfer-ownership`, `GET/PATCH/DELETE /memberships[/{userId}]`).

### Implementation for User Story 8

- [ ] T104 [P] [US8] Implement `LastOwnerPolicy` in `apps/api/src/modules/orgs/domain/last-owner.policy.ts` (research D13).
- [ ] T105 [US8] Implement the `update-org-settings`, `soft-delete-org` (Owner-only, sets `organizations.deletedAt`, revokes sessions/tokens — D14), `set-member-role`, `remove-member` (revoke removed user's sessions/tokens — US8 AC3), `transfer-ownership` (Owner-only, atomic), and `list-members` providers in `apps/api/src/modules/orgs/providers/` (depends on T104; cross-revokes the identity sessions/api_tokens repos via service contracts).
- [ ] T106 [US8] Extend `OrgsController` with `PATCH /orgs/current` (`'org:settings:write'`), `DELETE /orgs/current` (`'org:delete'`, Owner), `POST /orgs/current/transfer-ownership` (`'org:transfer'`, Owner) in `apps/api/src/modules/orgs/controllers/orgs.controller.ts`.
- [ ] T107 [US8] Implement `MembershipsController` in `apps/api/src/modules/orgs/controllers/memberships.controller.ts` (`GET /memberships` `'members:read'`; `PATCH/DELETE /memberships/{userId}` `'members:write'`, with the Admin-cannot-touch-Owner + last-owner guard).
- [ ] T108 [P] [US8] Build the org-settings + members admin UI in `apps/web/app/settings/organization/` and `apps/web/app/settings/members/` (edit settings, list/role-change/remove, transfer/delete with confirmation).

**Checkpoint**: Admins manage settings + members; Owner-only transfer/delete enforced; the org never loses its last Owner.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Close the parity + required-test gates, the security NFRs, the SDK/docs, and the coverage bar.

- [ ] T109 Register the M0 MCP tool **definitions** in `packages/contracts/src/mcp/registry.ts` (`whoami`, `list_workspaces`, `get_workspace`, `set_active_workspace`, `get/update_org_settings`, `list_members`, `invite_member`, `set_member_role`, `remove_member`, `transfer_ownership`, `list/create/revoke_api_token`) and add their `serviceCapabilities`; **exclude credential-acquisition flows** with a comment (research D11). Mark destructive tools with a dry-run/confirmation flag stub (mcp-tools.md §Safety).
- [ ] T110 Extend `scripts/check-mcp-parity.ts` to cover the `identity`/`orgs` capabilities and confirm `pnpm check:mcp-parity` is green (credential flows correctly absent).
- [ ] T111 Run `pnpm check:required-tests` and resolve every gap so the gate is green for the `identity` + `orgs` test plans (Principle V, SC-013/014).
- [ ] T112 [P] Add the production transport-security config test in `apps/api/src/common/testing/transport-security.spec.ts` (TLS-only/HSTS; secure, HTTP-only session cookies — NFR-SEC-001, SC-015).
- [ ] T113 [P] Regenerate the typed client in `packages/sdk/` from the updated OpenAPI.
- [ ] T114 [P] Validate `specs/002-identity-tenancy-onboarding/quickstart.md` end-to-end (`docker compose up` → migrate → seed → curl loop → gates) and fix any drift.
- [ ] T115 Run `pnpm test:coverage` and meet the constitution gates (≥80% line, ≥90% domain+providers, ≥90% branch on policies); add focused tests where short.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**. The schema (T004–T008), contracts (T009–T011), shared primitives/repos (T012–T024), and wiring/seed/helper (T025–T029) must land first.
- **User stories (Phases 3–10)**: all depend on Foundational. P1 order is US1 → US2 → US5 with US3/US4 between; the cross-cutting US5 suite (T079) needs US1–US4 routes + the live guards.
- **Polish (Phase 11)**: depends on all desired stories.

### Story-level dependencies (retrofit reality)

- **US1** uses the Foundational session primitive (T024) and M1's `seed-default-statuses`; demonstrable against **stub** guards.
- **US2** makes `AuthGuard`/middleware/`ThrottleGuard` live (T054–T056) and migrates M1 tests off the dev header (T057). After US2, all routes require a verified principal.
- **US3** reuses the Foundational `memberships`/`workspaces` repos; independent given Foundational.
- **US4** fills `RbacGuard` (T076) and retrofits M1 controllers (T077); its authz-matrix (T072) needs US1–US3 routes.
- **US5** fills `TenantGuard` (T082); its isolation suite (T079) needs the live pipeline + `withPrincipal()`.
- **US6 / US7** extend `AuthController`/`RbacGuard` from US2/US4 (T088→T051, T099→T076).
- **US8** cross-revokes identity sessions/tokens (US2/US7 repos) and consumes the `RoleChanged` seam (T078).

### Within each story

- Tests are written first and must fail before implementation (Principle V).
- Repositories/policies → providers → services → controllers → UI.
- Guard *logic* fills follow the routes/services it gates.

### Parallel opportunities

- All Setup `[P]` tasks (T002, T003).
- Within Foundational: schema T004→T005/T006→T007→T008 is sequential (one file/chain); contracts T009/T010 are `[P]`; shared primitives + the five repositories (T012–T023) are largely `[P]` (distinct files); declarations/helper/seed (T026–T029) are `[P]`.
- Within a story, all `[P]` test tasks run together, and `[P]` policy/repo/UI tasks run together.
- With staff, **US3, US6, US7** can proceed in parallel once Foundational + US2 land; **US4/US5** serialize on the guard fills.

---

## Parallel Example: User Story 2

```bash
# Tests first (all [P] — distinct files):
Task: "Unit test password.policy in apps/api/src/modules/identity/domain/password.policy.spec.ts"
Task: "Unit test token.policy in apps/api/src/modules/identity/domain/token.policy.spec.ts"
Task: "Integration login.provider.int.spec.ts"
Task: "Contract auth.controller.contract.spec.ts"
Task: "Tenancy sessions.tenancy.spec.ts"
Task: "Integration brute-force.int.spec.ts"
Task: "Security no-secrets-in-logs.spec.ts"

# Then parallel implementation where files differ:
Task: "Implement PasswordPolicy + TokenPolicy (domain/)"
Task: "Build login + register screens in apps/web/app/(auth)/"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational — the blocking spine).
2. Complete Phase 3 (US1): a clean instance bootstraps to a signed-in Owner with a starter project.
3. **STOP & VALIDATE** the first-run wizard independently (SC-001) against stub guards; demo.

### Incremental delivery (recommended P1 order)

1. Foundation ready → **US1** (first-run, MVP).
2. **US2** (sign-in/sessions) → the pipeline goes live; M1 + M0 run under genuine auth.
3. **US3** (invitations) → collaborative.
4. **US4** (RBAC everywhere) → default-deny enforced across M0 + M1; flagship e2e.
5. **US5** (tenant isolation) → cross-org suite proves 0 leaks; single-org no-migration.
6. Then **US6** (recovery), **US7** (PATs), **US8** (admin), Polish.

### Parallel team strategy

- Whole team lands Setup + Foundational together (it blocks everything).
- Then: Dev A → US1+US2 (the auth core), Dev B → US3 (invites), Dev C → US4/US5 (guards + isolation), with US6/US7/US8 picked up as the guard fills complete.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every story is independently testable; the retrofit dependencies above are explicit where a later story makes a stubbed seam real.
- Verify each required test FAILS before implementing it; `check-required-tests` also fails if a declared test file is **missing** (Principle V).
- Commit after each task or logical group; stop at any checkpoint to validate a story.
- Do **not** break the M1 contract (`users.organizationId`, `project_members`, `TenantScopedRepository`, `TenantContextService`); the migration is additive (`0002_*`), no drops/retypes.
