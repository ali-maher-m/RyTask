# Phase 1 Data Model: Identity, Tenancy & Onboarding (M0)

**Feature**: `002-identity-tenancy-onboarding` · **Date**: 2026-06-01 · **Source of truth**:
`packages/db/src/tables.ts` (Drizzle). This document specifies the M0 **extensions** to the shipped
tenancy spine (`organizations`, `workspaces`, `users`) and the **new** tables (`memberships`,
`sessions`, `api_tokens`, `invitations`, `one_time_tokens`).

**Conventions** (mirror the existing `tables.ts`): UUIDv7 primary keys app-side (`primaryId()`),
`timestamptz` via the shared `timestamps` spread, every tenant-scoped table carries
`organization_id NOT NULL` with a composite index **leading on `organization_id`** (ADR-002),
`references(..., { onDelete: ... })`, index arrays returned as `(t) => [ ... ]`. New enums live in
`packages/db/src/enums.ts`. Soft-delete (`deleted_at`) only where recovery is required.

> **Tenancy invariant (Principle II)**: every table below except `users` is tenant-scoped and carries
> `organization_id`. `users` keeps the shipped global identity shape (`organization_id` retained for M1
> compatibility — research D1). Reads go through `TenantScopedRepository`, which injects
> `WHERE organization_id = :orgId`. Cross-tenant isolation is asserted per table (FR-TEN-001/003,
> FR-TEST-007, SC-008).

> **Compatibility invariant (research D0/D1)**: M0 must not break M1. It only **adds** columns/tables;
> it does not drop or retype any column M1 references (`users.organizationId`, `project_members`, the
> work-items graph). The migration is additive (`0002_*`).

---

## 1. Enums (extend `packages/db/src/enums.ts`)

```ts
// FR-RBAC-001 — built-in roles, ordered most→least privileged (ordinal can drive UI).
export const roleEnum = pgEnum('role_type', ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER']);

// FR-AUTH-007 — credential type. PAT/MCP issued in M0; OAUTH reserved for v2 social login.
export const tokenTypeEnum = pgEnum('token_type', ['PAT', 'OAUTH', 'MCP']);

// FR-AUTH-003 — single-use email tokens. (api_tokens are separate, long-lived, listable.)
export const oneTimeTokenPurposeEnum = pgEnum('one_time_token_purpose', [
  'EMAIL_VERIFY',
  'PASSWORD_RESET',
]);
```

> The existing `projectRoleEnum` `[ADMIN, MEMBER, VIEWER]` (M1) is unchanged. Org-level `role_type`
> governs org/workspace actions and the `isOrgAdmin` bypass; `project_role` governs project-scoped
> actions for non-org-admins (research D6).

---

## 2. Extended tables

### 2.1 `organizations` (extend — FR-TEN-004, FR-TEN-006)

Add organization settings and a soft-delete marker. Existing columns (`id`, `name`, `slug`,
`timestamps`) and the `slug` unique index are unchanged.

| Column | Type | Notes |
|---|---|---|
| `settings` | jsonb NOT NULL default `{}` | `OrgSettings`: `timezone`, `locale`, `weekStart`, `workingDays`, `workingHours`, `logoUrl`, `allowPublicSignup` (default false — D8) (FR-TEN-004) |
| `deleted_at` | timestamptz (null) | Owner-only soft-delete (D14); v2 hard-purge job consumes this (FR-TEN-006) |

```ts
// added to the existing organizations table definition
settings: jsonb('settings').$type<OrgSettings>().notNull().default({}),
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

`OrgSettings` type lives in `packages/db` and is re-exported via `packages/contracts` for the API DTO.

### 2.2 `users` (extend — FR-AUTH-001/003)

Add authentication columns. Existing columns (`id`, `organization_id`, `email`, `name`, `timestamps`),
the `users_org_idx`, and the `users_org_email_unique` index are unchanged (M1 depends on them).

| Column | Type | Notes |
|---|---|---|
| `password_hash` | text (null) | argon2id (D2); null reserved for SSO-only users (v2, FR-AUTH-004) |
| `email_verified_at` | timestamptz (null) | set on verification or at first-run/seed (FR-AUTH-003) |
| `deactivated_at` | timestamptz (null) | member removal/deactivation; gates auth + revokes sessions (US8 AC3) |

```ts
passwordHash: text('password_hash'),
emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
```

---

## 3. New tables

### 3.1 `memberships` (FR-RBAC-001, ARCHITECTURE §5.2)

The role-bearing record linking a user to an organization. 1:1 with a user in single-org M0 (D1).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `primaryId()` |
| `organization_id` | uuid NOT NULL → organizations (cascade) | tenant scope |
| `workspace_id` | uuid → workspaces (set null) | reserved for workspace-scoped roles (v2, FR-TEN-002) |
| `user_id` | uuid NOT NULL → users (cascade) | |
| `role` | `role_type` NOT NULL default `MEMBER` | OWNER/ADMIN/MEMBER/GUEST/VIEWER |
| `deactivated_at` | timestamptz (null) | inactive membership (mirrors user removal) |
| `...timestamps` | | |

Indexes: `(organization_id)` (`memberships_org_idx`); **unique** `(organization_id, user_id)`
(`memberships_org_user_unique`); `(organization_id, role)` for "list members by role" / last-owner count.

**State / invariants**: an org has **≥1 active `OWNER`** at all times (`LastOwnerPolicy`, D13). Role
changes and removals are Owner/Admin actions; the last Owner cannot be demoted/removed (SC-007/SC-015).

### 3.2 `sessions` (FR-AUTH-002 — refresh tokens, rotation, revocation)

One row per active refresh credential (optionally per device). Access tokens are **not** stored.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL → organizations (cascade) | tenant scope |
| `user_id` | uuid NOT NULL → users (cascade) | |
| `family_id` | uuid NOT NULL | rotation lineage; reuse of a rotated token revokes the whole family (D3) |
| `refresh_token_hash` | text NOT NULL | argon2/keyed hash; never the plaintext (SC-002) |
| `user_agent` | text (null) | device hint (FR-AUTH-008 listing is v2; column is cheap) |
| `ip` | text (null) | |
| `expires_at` | timestamptz NOT NULL | refresh lifetime |
| `last_used_at` | timestamptz (null) | updated on rotate |
| `revoked_at` | timestamptz (null) | logout / family revoke / member removal |
| `created_at` | timestamptz NOT NULL | |

Indexes: `(organization_id, user_id)` (`sessions_org_user_idx`); `(refresh_token_hash)`
(`sessions_token_hash_idx`); `(family_id)` (`sessions_family_idx`).

**State machine** (refresh token): `active → (refresh) → rotated(new active, old revoked)`; `active →
(logout/admin) → revoked`; `rotated-token presented again → THEFT → revoke whole family`. Subsequent use
of any revoked token → `401` (SC-003).

### 3.3 `api_tokens` (FR-AUTH-007, FR-RBAC-009 — PAT/MCP, ARCHITECTURE §5.2)

Long-lived, named, scoped credentials for non-UI access.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL → organizations (cascade) | tenant scope |
| `user_id` | uuid NOT NULL → users (cascade) | the principal the token acts as (§7.2) |
| `type` | `token_type` NOT NULL default `PAT` | PAT or MCP |
| `name` | text NOT NULL | human label |
| `token_hash` | text NOT NULL | hash-at-rest; secret shown once (SC-002/SC-012) |
| `scopes` | jsonb `string[]` NOT NULL default `[]` | e.g. `issues:read`; effective = scope ∩ role (D5) |
| `last_used_at` | timestamptz (null) | stamped on each authenticated call (FR-AUTH-007) |
| `expires_at` | timestamptz (null) | optional expiry |
| `revoked_at` | timestamptz (null) | revocation → immediate rejection (SC-012) |
| `created_at` | timestamptz NOT NULL | |

Indexes: `(organization_id)` (`api_tokens_org_idx`); `(token_hash)` (`api_tokens_token_hash_idx`).

**State**: `active → (revoke) → revoked`; expired or revoked → rejected. Out-of-scope **or** beyond-role
call → `403` (SC-012).

### 3.4 `invitations` (FR-AUTH-011 — email + link, role pre-assignment)

A pending offer to join at a role; single-use; revocable.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL → organizations (cascade) | tenant scope |
| `workspace_id` | uuid → workspaces (set null) | target workspace (single workspace in M0) |
| `email` | text (null) | set for email invites; null for shareable-link invites (D8) |
| `role` | `role_type` NOT NULL default `MEMBER` | pre-assigned role on accept |
| `token_hash` | text NOT NULL | hashed redeemable token |
| `invited_by_user_id` | uuid → users (set null) | attribution |
| `expires_at` | timestamptz NOT NULL | |
| `accepted_at` | timestamptz (null) | single-use marker |
| `revoked_at` | timestamptz (null) | admin revoke (US3 AC5) |
| `created_at` | timestamptz NOT NULL | |

Indexes: `(organization_id)` (`invitations_org_idx`); `(token_hash)` (`invitations_token_hash_idx`);
partial unique on `(organization_id, lower(email))` **where** `accepted_at IS NULL AND revoked_at IS
NULL AND email IS NOT NULL` (one live email-invite per address — enforced in the migration).

**State machine**: `pending → (accept) → accepted` | `pending → (revoke) → revoked` | `pending →
(expiry) → expired`. Redeeming anything but `pending` (and unexpired) → refused, **no membership created**
(US3 AC3). Accepting for an already-member → no duplicate membership (US3 AC4, idempotent).

### 3.5 `one_time_tokens` (FR-AUTH-003 — verification & reset)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL → organizations (cascade) | tenant scope |
| `user_id` | uuid NOT NULL → users (cascade) | |
| `purpose` | `one_time_token_purpose` NOT NULL | EMAIL_VERIFY / PASSWORD_RESET |
| `token_hash` | text NOT NULL | hashed |
| `expires_at` | timestamptz NOT NULL | time-limited |
| `consumed_at` | timestamptz (null) | single-use marker |
| `created_at` | timestamptz NOT NULL | |

Indexes: `(organization_id, user_id)` (`ott_org_user_idx`); `(token_hash)` (`ott_token_hash_idx`).

**State**: `issued → (consume) → consumed`; consumed or expired → rejected (SC-010). Reset for an unknown
email issues nothing but returns the **same** response (no enumeration, US6 AC3).

---

## 4. Module ownership map (Principle III)

| Table | Owning context (module) | Notes |
|---|---|---|
| `users` (auth cols), `sessions`, `api_tokens`, `one_time_tokens` | **identity** | auth, sessions, PATs, verify/reset |
| `organizations` (settings), `workspaces`, `memberships`, `invitations` | **orgs** | tenancy root, roles, invites, onboarding |
| `project_members`, `projects`, `statuses`, work-items graph | **projects / work-items** (M1) | unchanged; consumed via published services |

Cross-context reads (e.g. `identity` needs a user's org role to build the principal) go through the
`orgs` module's `AccessService`/`memberships.contract.ts` — never by importing its repositories
(Principle III). The principal is assembled once (D4) and carried in ALS.

---

## 5. Required tenancy & policy tests (Principle V, FR-TEST-007)

- **Per-table tenancy isolation** (`*.tenancy.spec.ts`) for `memberships`, `sessions`, `api_tokens`,
  `invitations`, `one_time_tokens` — org A cannot read/write org B's rows.
- **Cross-tenant isolation suite** (`tenant-isolation.suite.spec.ts`) — two orgs; every M0 **and** M1
  read/list/search/get-by-id as A returns 0 B-rows under a **real principal** (SC-008).
- **Domain-policy units** — `password.policy`, `token.policy` (rotation + family reuse), `scope.policy`
  (scope ∩ role), `role.policy`, `last-owner.policy`, `invitation.policy`, `bootstrap.policy`.
- **Authorization matrix** (`authz-matrix.spec.ts`) — role × representative route incl. Viewer-mutation
  `403` and Owner-only `org:delete`/`org:transfer` (SC-005/006/007).
- **Provider integration tests** vs real Postgres for every provider; **controller contract tests** for
  every route; **processor** tests if any background job is added (e.g. email send via Mailer port).

---

## 6. Migration notes

- One additive migration `packages/db/migrations/0002_*` generated by `drizzle-kit generate`: new enums,
  new tables, added columns on `organizations`/`users`. **No drops, no retypes** (compatibility
  invariant). The partial unique indexes (live email-invite; any partial indexes) are emitted at the SQL
  layer if drizzle-kit cannot express the predicate.
- `seed.ts` updated (research D16): the seeded founder gets an argon2 `password_hash`, `email_verified_at`,
  and an `OWNER` `membership` in `SEED_ORG_ID`, so `docker compose up` yields a working signed-in Owner
  and the demo continues to run.
