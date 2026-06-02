# Quickstart: Identity, Tenancy & Onboarding (M0)

Run, seed, and test the M0 slice. M0 turns the pipeline **live**: the permissive stub guards become real
auth/RBAC/tenant resolution, and the dev-header seam (`x-user-id` / `x-organization-id`) is replaced by
verified tokens.

## 1. Run the stack

```bash
docker compose up -d          # web :3000, api :3001, postgres, redis, mailhog :8025, minio
pnpm --filter @rytask/db migrate   # applies 0002_* (new enums + tables + columns)
pnpm --filter @rytask/db seed      # founder gets an argon2 password + OWNER membership (verified)
```

- **Fresh DB (no org)** → opening `http://localhost:3000` routes to **`/setup`** (first-run wizard,
  FR-AUTH-010). Complete it (≤5 steps) to create the org + owner + workspace + starter project, then you
  land signed-in (US1).
- **Seeded DB** → `/setup` returns 409; sign in at `/login` as the seeded founder
  (`founder@rytask.local`, dev password from `seed.ts`).
- Verification / reset / invite emails are captured by **Mailhog** at `http://localhost:8025`.

## 2. Exercise the core loop (curl)

```bash
# Sign in → access + rotating refresh
curl -s localhost:3001/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"founder@rytask.local","password":"<dev-pass>"}'      # -> { accessToken, refreshToken, ... }

ACCESS=...   # from above
# Who am I — principal, role (OWNER), scopes, workspaces
curl -s localhost:3001/api/v1/auth/whoami -H "authorization: Bearer $ACCESS"

# Invite a teammate as MEMBER (Admin+); grab the acceptUrl from the response or Mailhog
curl -s localhost:3001/api/v1/invites -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' -d '{"email":"sam@example.com","role":"MEMBER"}'

# Mint a PAT for API/MCP (secret shown ONCE)
curl -s localhost:3001/api/v1/api-tokens -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' -d '{"name":"ci","type":"PAT","scopes":["issues:read"]}'
```

## 3. What "done" looks like (maps to Success Criteria)

| Check | How | SC |
|---|---|---|
| First-run wizard ≤5 steps to a usable workspace | `/setup` e2e + manual | SC-001 |
| Passwords only as argon2 hashes; no secrets in logs/URLs | inspect DB + log scan test | SC-002 |
| Access TTL ≤15 min; refresh rotates; logout/reuse rejected | `auth.refresh` + token.policy tests | SC-003 |
| Invitee lands at the pre-assigned role | invite→accept e2e | SC-004 |
| Every route default-deny, server-side | authz-matrix.spec | SC-005 |
| Viewer cannot mutate | authz-matrix.spec | SC-006 |
| Owner-only delete/transfer; ≥1 Owner always | last-owner.policy + authz-matrix | SC-007/015 |
| 0 cross-org rows ever returned | tenant-isolation.suite.spec | SC-008 |
| Single-org works; 2nd org needs no migration | integration run + schema diff | SC-009 |
| Verify/reset links single-use, no enumeration | one-time-token tests | SC-010 |
| Brute-force lockout after threshold | throttle integration test | SC-011 |
| PAT scope ∩ role; revoke rejects | scope.policy + api-token tests | SC-012 |
| Every Must has ≥1 test; CI fails on a missing required test | `pnpm check:required-tests` | SC-013/014 |

## 4. Run the gates & tests

```bash
pnpm check:required-tests      # fails if identity/orgs declare a required test that is missing (Principle V)
pnpm check:mcp-parity          # M0 domain capabilities ↔ tools; credential flows excluded by design (D11)
pnpm --filter @rytask/api test         # unit + integration vs REAL ephemeral Postgres (testcontainers)
pnpm --filter @rytask/web e2e          # signup→invite→accept→rbac (+ axe)
pnpm test:coverage             # >=80% line / >=90% domain+providers / >=90% branch on policies
```

## 5. Migrating off the M1 dev-header seam

- M1 integration/contract tests previously set `x-user-id` / `x-organization-id`. M0 removes
  `resolveDevPrincipal` from the runtime; tests now use the **`withPrincipal()` helper**
  (`apps/api/src/common/testing/`) which mints a **real** access token for a seeded user, so existing M1
  specs run against genuine auth (research D0/D16). The seeded founder is an `OWNER`, so M1 admin-path
  tests keep passing; add project-role fixtures where a test asserts the non-admin fallback.
- After M0, **unauthenticated requests are rejected** (`401`) before reaching a repository — the previous
  "repositories fail loudly without context" path is now guarded up front.

## 6. Module layout (where the code lives)

- `apps/api/src/modules/identity/` — auth, sessions, PATs, verify/reset, whoami.
- `apps/api/src/modules/orgs/` — org settings, workspaces, memberships/roles, invites, first-run.
- `apps/api/src/common/{guards,rbac,tenancy}/` — the now-real AuthGuard/TenantGuard/RbacGuard/ThrottleGuard,
  the permission catalog + `@RequirePermission`/`@Public`/`@Roles` decorators, and the
  middleware that establishes ALS from the verified principal.
- `packages/db/src/{enums,tables,seed}.ts` + `migrations/0002_*` — the schema source of truth.
- `packages/contracts/src/{identity,orgs}.contract.ts` + `mcp/registry.ts` — DTOs + MCP definitions.
