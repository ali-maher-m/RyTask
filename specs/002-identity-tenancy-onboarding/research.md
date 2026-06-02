# Phase 0 Research: Identity, Tenancy & Onboarding (M0)

**Feature**: `002-identity-tenancy-onboarding` · **Date**: 2026-06-01

Each decision is **Decision / Rationale / Alternatives considered**, traced to requirement IDs and
constitution principles. There were **no open `NEEDS CLARIFICATION` items** from the spec; the entries
below record the design choices made from reasonable defaults (spec Assumptions) plus the reconciliation
with the **already-implemented M1** and the shipped scaffold.

---

## D0. M0 is a retrofit of fixed seams, not a rebuild

**Decision**: Populate the existing **permissive stubs** rather than introduce a parallel auth layer.
The scaffold ships, and M1 was authored against, exactly these seams:

- `apps/api/src/common/guards/auth.guard.ts` — returns `true` → M0 verifies JWT/PAT, attaches the
  principal, rejects on failure (honoring `@Public`).
- `apps/api/src/common/guards/tenant.guard.ts` — returns `true` → M0 resolves org from the principal,
  asserts membership, establishes `TenantContextService` ALS.
- `apps/api/src/common/guards/rbac.guard.ts` — returns `true` → M0 enforces role/permission per route.
- `apps/api/src/common/guards/throttle.guard.ts` — returns `true` → M0 enforces Redis-backed buckets.
- `apps/api/src/common/auth/principal.ts` `resolveDevPrincipal()` — reads `x-user-id`/`x-organization-id`
  headers → M0 removes this from the runtime path (verified-token resolution replaces it).

`TenantContextService` (AsyncLocalStorage) and `TenantScopedRepository` are **already real** and used by
every M1 repository; M0 does **not** touch their shape.

**Rationale**: M1's research D0 fixed this contract: "M1 is authored against the intended behaviour and
is not mergeable until M0 populates them." Honoring the seams means M1's ~13 tenancy-isolation specs and
RBAC contract tests flip from vacuously-passing-on-stubs to genuinely enforced, with zero churn to M1
code. Principles II and VI move from "verified by M0" to "implemented by M0".

**Alternatives considered**: *New middleware stack / passport strategy bolted alongside* — rejected;
duplicates the seam, risks two sources of truth for the principal, and would bypass the ALS the repos
depend on. *Rewrite tenancy infra* — rejected; it is already correct and load-bearing for M1.

---

## D1. Identity shape — keep `users.organizationId`, add `memberships` for the role

**Decision**: Keep the shipped `users` shape (`organizationId NOT NULL`, unique `(organizationId,
email)`) that M1 depends on, and introduce a **`memberships`** table `(organizationId, userId, role,
status)` (unique `(organizationId, userId)`) as the **role-bearing record**, per ARCHITECTURE §3.2/§5.2.
In single-org M0 a membership is 1:1 with a user (its `organizationId` equals the user's). `role` uses
the new `role_type` enum `[OWNER, ADMIN, MEMBER, GUEST, VIEWER]` (FR-RBAC-001).

**Rationale**: Ripping `users.organizationId` would break M1 (repositories, seed, FKs, the dev seam).
Adding `memberships` aligns to the architecture's `orgs/workspaces` bounded context (which "owns
memberships, roles, invites"), keeps `users` as pure identity, and is the seam for v2 multi-org users
without a schema redesign. The slight redundancy (`organizationId` on both `users` and `memberships` in
M0) is documented and resolved in v2 when users span orgs (`users.organizationId` is then dropped in
favor of memberships-only — a tracked migration).

**Alternatives considered**: *Put `role` directly on `users`* — simplest for single-org but diverges
from ARCHITECTURE and forces a painful reshape at multi-org. *Drop `users.organizationId` now and key
identity solely on `memberships`* — cleanest long-term but a breaking change to working M1 code, out of
proportion to M0's MVP scope (FR-TEN-003: single org in practice).

---

## D2. Password hashing — argon2id

**Decision**: Hash passwords (and one-time-token/PAT secrets) with **argon2id** via an `argon2` adapter
behind a `PasswordHasher` port. Tuned cost parameters supplied via env with safe defaults.

**Rationale**: NFR-SEC-002 names "argon2id/bcrypt cost-tuned"; ARCHITECTURE §5.2 annotates
`users.passwordHash` as "argon2id". argon2id is memory-hard and the current OWASP first choice. A port
keeps domain logic pure and the algorithm swappable.

**Alternatives considered**: *bcrypt* — acceptable per NFR but weaker against GPU/ASIC; chosen only as a
fallback if argon2 native bindings are unavailable in a target image. *scrypt* — fine but less idiomatic
in the Node ecosystem here.

---

## D3. Sessions — JWT access (≤15 min) + opaque rotating refresh with reuse detection

**Decision**: Issue a **signed access token** (asymmetric — EdDSA/RS256 — so the worker/MCP can verify
without a DB hit), TTL ≤ 15 min, carrying `sub` (userId), `org`, optional `wsp` (workspace), and a token
version. Issue an **opaque refresh token** stored only as an argon2 hash in `sessions`, grouped by a
**`familyId`**. Refreshing **rotates** the refresh token (old one invalidated); presenting an
already-rotated refresh token is treated as **theft → revoke the whole family** (FR-AUTH-002). Logout and
admin removal revoke the session/family immediately.

**Rationale**: FR-AUTH-002 (short access + rotating, revocable refresh), NFR-SEC-002, SC-003. Asymmetric
signing keeps token verification off the DB on the happy path (perf constraint) while refresh state in
Postgres gives real revocation. Family-based reuse detection is the standard refresh-rotation hardening.

**Alternatives considered**: *Stateless-only JWT (no refresh table)* — cannot truly revoke before
expiry; fails "logout revokes session" (SC-003). *Opaque access tokens with per-request DB lookup* —
simplest to revoke but adds a DB round-trip to every request (perf) and complicates worker/MCP
verification.

---

## D4. Where tokens are verified — middleware establishes ALS; AuthGuard asserts

**Decision**: Verify the bearer credential (JWT **or** PAT) in `TenantContextMiddleware`: on success set
`req.principal` and wrap the downstream in `tenant.run({...})`; on absence leave it unset. `AuthGuard`
then asserts a principal exists (else `401`) unless the route is `@Public()`. `TenantGuard` asserts the
principal's org membership and that an ALS context is present.

**Rationale**: ALS must wrap the **entire** downstream (guards → handler) so repositories auto-scope;
middleware is the only layer that runs before guards (this is exactly why the scaffold already
establishes context in middleware). Splitting "establish context" (middleware) from "reject if missing"
(guard) keeps each piece single-responsibility and matches the shipped design.

**Alternatives considered**: *Verify inside `AuthGuard`* — guards run inside the request but Nest guards
cannot wrap the handler in an ALS `run()` cleanly; would require re-establishing context, duplicating
the middleware. *Passport* — heavier; the two credential types (JWT, PAT) are simple enough to verify
directly behind a `TokenVerifier` service.

---

## D5. Personal Access Tokens — prefixed secret, hash-at-rest, scope ∩ role

**Decision**: PATs use the shipped `api_tokens` shape (ARCHITECTURE §5.2): a human-named token whose
secret is `rytask_pat_<random>`, returned **once** and stored only as `tokenHash` (argon2/SHA-256-keyed),
with `type ∈ {PAT, MCP}`, `scopes jsonb string[]`, `lastUsedAt`, `expiresAt`, `revokedAt`. The verifier
looks the token up by hash, checks expiry/revocation, resolves the owning user's principal, and stamps
`lastUsedAt`. **Effective permission = token scope ∩ holder's role** (FR-RBAC-009, coarse-grained in M0).

**Rationale**: FR-AUTH-007 (scoped, revocable, last-used, non-recoverable) and §7.2 (an MCP PAT "resolves
to a user principal, so the agent acts as that user … never more"). This is the authenticated, scoped
groundwork Persona E (the AI Agent) depends on.

**Alternatives considered**: *Store the token plaintext* — rejected (NFR-SEC-002/SC-002). *JWT-style
self-describing PATs* — can't be revoked before expiry without a denylist; the hash-lookup table gives
clean revocation and `lastUsedAt`.

---

## D6. RBAC — role→permission catalog, `@RequirePermission` metadata, default-deny, org-admin bypass

**Decision**: Add a `common/rbac/` permission catalog mapping each `role_type` to a permission set, a
`@RequirePermission('resource:action')` (and `@Roles(...)`) decorator, and a populated `RbacGuard` that
reads the route's required permission from metadata and checks it against the principal. **Default-deny**:
an authenticated route with no `@Public` and no satisfiable permission is refused. Org `OWNER`/`ADMIN`
set `Principal.isOrgAdmin = true` and **bypass project-role checks**; otherwise project-scoped routes
defer to the existing M1 `ProjectAccessService`/`project_members`. `VIEWER` is read-only (mutations →
`403`, commenting configurable); Owner-only actions (`org:delete`, `org:transfer`) require `OWNER`.

**Rationale**: Principle VI ("RBAC guard on every endpoint, server-side, from the principal"),
FR-RBAC-001/002/003/007, SC-005/006/007. M1 controllers already declare an `x-rbac` matrix in their
OpenAPI; M0 makes it executable by attaching the decorator + guard, so the retrofit is mechanical and
testable as an authz matrix.

**Alternatives considered**: *Hard-code role checks in each controller* — violates "enforced by guard,
not convention" and scatters policy. *Full custom-role/permission-catalog engine* — FR-RBAC-005 is v3;
M0 ships the fixed built-in roles only.

---

## D7. First-run onboarding — a bootstrap-guarded `/setup` flow

**Decision**: A `@Public` `/setup` flow is reachable **only while zero organizations exist** (a
`BootstrapPolicy` checks org count). It atomically creates the **organization** (+ default `settings`),
the **owner** user (argon2 hash, email auto-verified), the **owner `membership`**, the default
**workspace**, and a **starter project** — reusing M1's project-create + `seed-default-statuses` so the
project lands with the six categorized statuses. Once bootstrapped, `/setup` returns `409` and the app
routes to login (US1 AC3).

**Rationale**: FR-AUTH-010 (≤5 steps to a usable workspace, "Albert/Marissa test"); reusing the M1
seeding path guarantees a new org is immediately demonstrable (same statuses the rest of the product
assumes). Gating on org-count makes first-run safe to expose without auth and impossible to re-run.

**Alternatives considered**: *CLI/env-only bootstrap* — fails the non-technical Self-Hoster (Persona D)
and the Albert test. *Always-open public registration that implicitly creates orgs* — conflicts with the
single-org, invite-only default (D8) and the "first run creates exactly one Owner" assumption.

---

## D8. Invitations — email + link, role pre-assigned, single-use, invite-only by default

**Decision**: After bootstrap, new people join by **invitation** (open self-registration is **off by
default**, an org-configurable setting — spec Assumption). An `invitations` row carries `email`
(nullable for link invites), `role`, a hashed `token`, `invitedByUserId`, `expiresAt`, `acceptedAt`,
`revokedAt`. **Email invite**: addressed to one email via the `Mailer` port. **Link invite**: a shareable
org-scoped token. Accepting creates the user (if new, prompting password set) + a `membership` at the
pre-assigned role. **Idempotent**: redeeming an accepted/expired/revoked invite is refused; an invite for
an existing member creates no duplicate (US3 AC3/AC4).

**Rationale**: FR-AUTH-011, SC-004; Stage-1 "internal, single-org" intent makes invite-only the safe
default while keeping public signup as a switch for later/SaaS.

**Alternatives considered**: *Auto-join by email domain* — surprising and unsafe for self-host. *No link
invites* — email-only blocks the common "share a link in Slack" flow the product targets.

---

## D9. Email verification & password reset — single-use one-time tokens, no enumeration

**Decision**: A `one_time_tokens` table `(userId, purpose, tokenHash, expiresAt, consumedAt)` with
`one_time_token_purpose ∈ {EMAIL_VERIFY, PASSWORD_RESET}`. Tokens are random, delivered via the `Mailer`
port, **single-use** (`consumedAt`) and **time-limited** (`expiresAt`). Password-reset requests return a
**uniform response** whether or not the email exists (no account enumeration); unverified accounts are
gated per the org policy (US6 AC3/AC4, SC-010).

**Rationale**: FR-AUTH-003, SC-010, NFR-SEC. One table with a purpose enum avoids a near-duplicate
second table and centralizes single-use/expiry logic.

**Alternatives considered**: *Reuse `api_tokens`* — wrong semantics (those are long-lived, scoped,
listable). *Two separate tables* — redundant; the lifecycle is identical.

---

## D10. Tenant isolation hardening + the isolation suite

**Decision**: `TenantGuard` resolves org **only** from the verified principal (never client input,
Principle II) and asserts the principal is an active member. New tenant-scoped tables get org-leading
composite indexes and per-table tenancy specs (mirroring M1's `*.tenancy.spec.ts`). A **cross-tenant
isolation suite** (FR-TEST-007) seeds two orgs and asserts that every read/list/search/get-by-id as org
A returns/affects **0** org-B rows — and, crucially, re-runs the M1 surface under a **real principal**
(replacing the dev header), so M1's isolation claims become genuinely enforced. Single-org operation is
verified end-to-end (FR-TEN-003) and enabling a 2nd org requires no migration.

**Rationale**: Principle II, FR-TEN-001/003, FR-TEST-007, SC-008/SC-009. This is the milestone's headline
correctness guarantee.

**Alternatives considered**: *Rely on repository scoping alone* — defense-in-depth wants the guard +
tests too. *Postgres RLS now* — ARCHITECTURE marks RLS a **v2 backstop**; adding it in M0 is extra scope
beyond the app-level guarantee.

---

## D11. MCP parity for M0 — domain tools registered; credential flows excluded by design

**Decision**: Register M0's **domain** capabilities as MCP tool definitions (keeping `check-mcp-parity`
green): `whoami`, `list_workspaces`, `get_workspace`, `set_active_workspace` (ARCHITECTURE §7.3, MVP);
plus org/member/token management — `get_org_settings`, `update_org_settings`, `list_members`,
`invite_member`, `set_member_role`, `remove_member`, `transfer_ownership`, `list_api_tokens`,
`create_api_token`, `revoke_api_token`. **Exclude from the parity capability set** the
credential-acquisition flows: `register`, `login`, `refresh`, `logout`, `verify_email`,
`request_password_reset`, `confirm_password_reset`, and `bootstrap` (first-run). MCP transport itself
stays deferred to the MCP milestone (Complexity C1).

**Rationale**: Principle IV demands every *domain* use case be agent-reachable, but login/refresh/reset
are **how a principal is obtained**, and MCP authenticates by **PAT** (§7.2) — an agent never "logs in".
Excluding them is correct, not a parity gap; including them would be nonsensical (no agent registers a
human). Registering the rest now prevents surface drift before the MCP milestone at near-zero cost.

**Alternatives considered**: *Expose every auth route as a tool* — semantically wrong and untestable as
an agent action. *Register nothing for M0* — `check-mcp-parity` would be falsely green and Principle IV
silently eroded.

---

## D12. Rate limiting & brute-force — Redis buckets, stricter on `/auth/*`, account+IP lockout

**Decision**: Populate `ThrottleGuard` with Redis token buckets keyed by principal (user/PAT) or IP for
anonymous routes. **Stricter buckets on `/auth/*`** and a **failed-login lockout** keyed on
`(emailHash, IP)` that throttles/locks after a configured threshold (FR-AUTH-001, §6.6, SC-011). Self-host
deployments keep generous defaults; values are env-configurable.

**Rationale**: FR-AUTH-001 ("brute-force throttled"), SC-011, §6.6. Reuses the existing Redis service —
no new dependency (Principle VII).

**Alternatives considered**: *In-memory counters* — wrong across the api/worker replicas. *No lockout,
throttle only* — throttling alone is weaker against slow credential stuffing.

---

## D13. Last-Owner invariant + ownership transfer

**Decision**: A `LastOwnerPolicy` forbids removing or demoting the **last `OWNER`** of an org (the org
always retains ≥1 Owner). `transfer_ownership` is **Owner-only**, atomic (promote target to OWNER, and
optionally demote the previous owner), and attributable. Member removal revokes the removed user's
sessions and tokens.

**Rationale**: FR-RBAC-003, SC-007/SC-015, US8 AC3/AC4/AC5. Prevents the org-bricking failure mode.

**Alternatives considered**: *Allow zero owners transiently* — leaves the org unadministrable; rejected.

---

## D14. Org deletion — Owner-only soft-delete in M0; GDPR purge/export deferred

**Decision**: M0 ships the **Owner-only delete action** as a **soft-delete** (`organizations.deletedAt`,
sessions/tokens revoked, org hidden). The **full GDPR hard-purge + data export** pipeline (FR-TEN-006,
FR-PORT-*) is **v2**.

**Rationale**: FR-RBAC-003 ("Owner can delete the org") is MVP and is satisfied by the action +
permission; the grace-period purge and machine-readable export are explicitly v2 in REQUIREMENTS. Keeps
M0 focused while leaving the seam (`deletedAt`) the v2 purge job will use.

**Alternatives considered**: *Hard-delete now* — irreversible and out of scope; risks data loss without
the export pipeline.

---

## D15. Audit log — deferred to v2; emit domain events now as the seam

**Decision**: The append-only **audit log** (FR-AUTH-009, FR-RBAC-008) is **v2**. M0 emits in-process
domain events (`UserRegistered`, `UserLoggedIn`, `TokenIssued`, `MemberInvited`, `MemberJoined`,
`RoleChanged`, …) via `@nestjs/event-emitter` so the future audit consumer subscribes without touching
M0 providers.

**Rationale**: Both audit requirements are v2 in REQUIREMENTS; events are a cheap, correct seam
(consistent with M1's event usage) that avoids retrofitting call sites later.

**Alternatives considered**: *Write audit rows in M0* — adds a table + write path the spec defers.
*No events* — forces a later invasive retrofit across every mutation.

---

## D16. Seed & the dev-header seam

**Decision**: Update `packages/db/src/seed.ts` so the seeded founder (`SEED_USER_ID`) has an **argon2
`passwordHash`** (known dev password), `emailVerifiedAt` set, and an **`OWNER` membership** in the seeded
org. **Remove `resolveDevPrincipal` from the runtime** path; keep a test-only `withPrincipal()` helper
that mints a **real** access token / sets a verified principal, so M1's and M0's integration/contract
tests run against genuine auth instead of trusted headers.

**Rationale**: Keeps `docker compose up` immediately demoable (Principle VII) while ensuring no
header-trust path survives into production (Principle VI). Tests stay fast by minting tokens directly
rather than driving the login UI.

**Alternatives considered**: *Keep the dev header behind a flag* — a header-trust path in prod is a
standing risk; a test-only helper is safer and explicit.

---

## D17. Enforced testing — declared plans, isolation suite, authz matrix

**Decision**: Declare `module.testplan.ts` for `identity` and `orgs` requiring: every provider → an
integration test vs **real Postgres**; every controller route → a contract test; domain policies
(`password`, `token`/rotation+reuse, `scope`, `role`, `last-owner`, `invitation`, `bootstrap`) → unit
tests; every new tenant-scoped table → a tenancy-isolation spec. Add a **cross-tenant isolation suite**
(FR-TEST-007) and an **authorization matrix** test (role × representative route, incl. Viewer-read-only
and Owner-only). Flagship **e2e**: signup→invite→accept→RBAC (+ axe). Coverage raised to the constitution
gates (≥80% line, ≥90% domain+providers, ≥90% branch on policies).

**Rationale**: Principle V (required-test presence fails CI, not just failures), FR-TEST-007, SC-013/014.
The authz matrix operationalizes the `x-rbac` annotations M1 already carries (FR-TEST-008 is v2, but a
focused M0 matrix strengthens SC-005 now).

**Alternatives considered**: *Lean on M1's existing tenancy specs* — they only become meaningful once M0
provides a real principal; M0 must add its own table specs + the cross-org suite. *Mock the DB for auth
tests* — forbidden by Principle V (mocks hide tenancy/SQL bugs).

---

## Resolved unknowns summary

| Unknown | Resolution | Trace |
|---|---|---|
| How M0 relates to already-built M1 | Retrofit the fixed stub seams; don't break the M1 contract | D0, D1, D16 |
| Where the org role lives | New `memberships` table; keep `users.organizationId` | D1 |
| Password / secret hashing | argon2id behind a port | D2, NFR-SEC-002 |
| Session model | JWT access ≤15 min + opaque rotating refresh w/ family reuse-detection | D3, FR-AUTH-002 |
| Token verification point | Middleware verifies + establishes ALS; AuthGuard asserts | D4 |
| PAT format & scope semantics | Prefixed secret, hash-at-rest, effective = scope ∩ role | D5, FR-AUTH-007 |
| RBAC enforcement | Permission catalog + `@RequirePermission` + default-deny guard; org-admin bypass | D6, FR-RBAC-* |
| First-run | Bootstrap-gated `/setup`, reuses M1 seeding | D7, FR-AUTH-010 |
| Invitations / signup policy | Email + link, role pre-assigned, invite-only default | D8, FR-AUTH-011 |
| Verify / reset | `one_time_tokens`, single-use, no enumeration | D9, FR-AUTH-003 |
| Tenant isolation proof | Guard + per-table specs + cross-org suite over M0 *and* M1 surface | D10, FR-TEN-*, FR-TEST-007 |
| MCP parity scope | Domain tools registered; credential flows excluded; transport deferred | D11, Principle IV, C1 |
| Brute-force / rate limit | Redis buckets, stricter `/auth/*`, account+IP lockout | D12, FR-AUTH-001 |
| Last-owner / transfer | `LastOwnerPolicy`; Owner-only atomic transfer | D13, FR-RBAC-003 |
| Org delete | Owner-only soft-delete; GDPR purge/export v2 | D14, FR-TEN-006 |
| Audit log | Deferred v2; emit events now | D15, FR-AUTH-009 |
| Testing | Declared plans + isolation suite + authz matrix + e2e | D17, Principle V |
