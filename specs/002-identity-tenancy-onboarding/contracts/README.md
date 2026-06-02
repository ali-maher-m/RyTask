# M0 Contracts — Identity, Tenancy & Onboarding

The REST API and domain events **are** the contract (Principle IV / ARCHITECTURE §6). The UI, MCP
server, and integrations are clients of this surface — never back doors. This directory defines the M0
slice of `/api/v1`.

| File | What it defines |
|---|---|
| `openapi.yaml` | REST endpoints for `/auth/*`, `/api-tokens`, `/orgs`, `/workspaces`, `/memberships`, `/invites`, `/setup`. Each route carries an `x-rbac` annotation (the executable permission, research D6). |
| `rbac-matrix.md` | The role × action permission matrix `RbacGuard` enforces, incl. the retrofit onto M1 routes. |
| `mcp-tools.md` | M0 MCP tool catalog (parity with `packages/contracts/src/mcp/registry.ts`) and the credential-flow exclusion (research D11). |

## Conventions

- **Base path** `/api/v1`. JSON only. UUIDv7 ids. `timestamptz` in ISO-8601.
- **AuthN**: `Authorization: Bearer <jwt|pat>`. Access token TTL ≤ 15 min; refresh via `/auth/refresh`
  (rotating). `@Public` routes (no token): `/setup`, `/auth/register`, `/auth/login`, `/auth/refresh`,
  `/auth/verify-email`, `/auth/request-password-reset`, `/auth/confirm-password-reset`,
  `/invites/{token}` (GET preview + accept). Everything else requires a verified principal (default-deny).
- **AuthZ**: every non-public route declares `x-rbac` (a required permission). Absence of a satisfiable
  permission → `403`. `VIEWER` mutations → `403`. Owner-only routes require `OWNER` (SC-007).
- **Tenancy**: the org is resolved from the principal only (never request body/query/header), then
  established in ALS; repositories auto-scope (Principle II).
- **Errors**: `401` (no/invalid credential), `403` (authenticated but not permitted), `404` (not found
  **or** cross-tenant id probe — never leak existence, FR-TEN cross-tenant), `409` (already bootstrapped /
  duplicate), `410` (expired/used invite or one-time token), `422` (validation), `429` (throttled /
  brute-force lockout). Reset/verify responses are **uniform** regardless of account existence (SC-010).
- **Rate limits**: stricter buckets on `/auth/*`; failed-login lockout per `(email, IP)` (D12, SC-011).
- **Idempotency**: mutating calls accept `Idempotency-Key`; invite/verify/reset accept are safe to retry.

## Route summary

| Method & path | Purpose | FR | `x-rbac` |
|---|---|---|---|
| `GET /setup` | Is first-run available? | FR-AUTH-010 | public (only if 0 orgs) |
| `POST /setup` | Bootstrap org + owner + workspace + starter project | FR-AUTH-010 | public (only if 0 orgs) → 409 after |
| `POST /auth/register` | Register (when self-signup enabled) | FR-AUTH-001 | public |
| `POST /auth/login` | Email+password → access + refresh | FR-AUTH-001/002 | public (throttled) |
| `POST /auth/refresh` | Rotate refresh → new access+refresh | FR-AUTH-002 | public (token-bearing) |
| `POST /auth/logout` | Revoke current session/family | FR-AUTH-002 | `self` |
| `POST /auth/verify-email` | Consume EMAIL_VERIFY token | FR-AUTH-003 | public |
| `POST /auth/request-password-reset` | Issue reset (uniform response) | FR-AUTH-003 | public |
| `POST /auth/confirm-password-reset` | Consume PASSWORD_RESET token | FR-AUTH-003 | public |
| `GET /auth/whoami` | Current principal, role, scopes, workspaces | FR-INT-MCP-001 | `self` |
| `GET /api-tokens` | List own PATs | FR-AUTH-007 | `tokens:read` (self) |
| `POST /api-tokens` | Mint a PAT (secret shown once) | FR-AUTH-007 | `tokens:write` (self) |
| `DELETE /api-tokens/{id}` | Revoke a PAT | FR-AUTH-007 | `tokens:write` (self) |
| `GET /orgs/current` | Get current org + settings | FR-TEN-004 | `org:read` |
| `PATCH /orgs/current` | Update org settings | FR-TEN-004 | `org:settings:write` (Admin+) |
| `DELETE /orgs/current` | Soft-delete the org | FR-TEN-006/RBAC-003 | `org:delete` (Owner) |
| `POST /orgs/current/transfer-ownership` | Transfer ownership | FR-RBAC-003 | `org:transfer` (Owner) |
| `GET /workspaces` | List workspaces | FR-TEN-002 | `workspace:read` |
| `GET /workspaces/{id}` | Get a workspace | FR-TEN-002 | `workspace:read` |
| `GET /memberships` | List members + roles | FR-RBAC-001 | `members:read` |
| `PATCH /memberships/{userId}` | Change a member's role | FR-RBAC-001 | `members:write` (Admin+) |
| `DELETE /memberships/{userId}` | Remove a member (revoke sessions) | FR-RBAC-001 | `members:write` (Admin+) |
| `POST /invites` | Invite by email or create a link, with role | FR-AUTH-011 | `members:invite` (Admin+) |
| `GET /invites` | List pending invites | FR-AUTH-011 | `members:read` |
| `GET /invites/{token}` | Preview an invite (public) | FR-AUTH-011 | public |
| `POST /invites/{token}/accept` | Accept → membership at role | FR-AUTH-011 | public (token-bearing) |
| `DELETE /invites/{id}` | Revoke a pending invite | FR-AUTH-011 | `members:invite` (Admin+) |

> `self` = acts only on the caller's own user/session/tokens. `Admin+` = `ADMIN` or `OWNER` (org-admin
> bypass, D6). Owner-only routes require `OWNER` and are guarded by `LastOwnerPolicy` where relevant (D13).
