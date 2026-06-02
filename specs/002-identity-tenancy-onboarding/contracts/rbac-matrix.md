# M0 RBAC Matrix (FR-RBAC-001/002/003/007, Principle VI)

`RbacGuard` enforces a required permission per route, read from `@RequirePermission('resource:action')`
metadata, **default-deny** (research D6). The org is resolved from the verified principal (Principle II).
`OWNER`/`ADMIN` set `isOrgAdmin` and **bypass project-role checks**; otherwise project-scoped routes
defer to the M1 `ProjectAccessService` / `project_members`.

## Permission catalog → role

✅ allowed · ❌ denied (`403`) · `self` = own user/session/tokens only

| Permission | OWNER | ADMIN | MEMBER | GUEST | VIEWER |
|---|:--:|:--:|:--:|:--:|:--:|
| `self` (whoami, logout, own tokens) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tokens:read` / `tokens:write` (own PATs) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `org:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace:read` | ✅ | ✅ | ✅ | ✅¹ | ✅ |
| `members:read` | ✅ | ✅ | ✅ | ❌ | ✅ |
| `org:settings:write` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `members:invite` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `members:write` (role change / remove) | ✅ | ✅² | ❌ | ❌ | ❌ |
| `org:delete` (Owner-only) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `org:transfer` (Owner-only) | ✅ | ❌ | ❌ | ❌ | ❌ |

¹ Guest workspace visibility is least-privilege in M0 (full guest project-scoping is FR-RBAC-006, v2).
² An Admin cannot change/remove an `OWNER`, and no actor can remove/demote the **last** `OWNER`
  (`LastOwnerPolicy`, D13 — `409`, SC-015).

## Cross-cutting rules

- **VIEWER is read-only** (FR-RBAC-007, SC-006): every mutating route → `403`; reads allowed; commenting
  is a configurable toggle (enforced in the M1 comments module, not here).
- **Default-deny** (FR-RBAC-002, SC-005): an authenticated route with no satisfiable permission is
  refused regardless of the client; UI hiding is cosmetic only.
- **Effective permission for PAT/MCP** = token scope ∩ holder's role (FR-RBAC-009, D5): an out-of-scope
  call is `403` even if the role would allow it; a beyond-role call is `403` even if the scope would.
- **Tenant scope** is applied before RBAC: a cross-org id is `404` (existence never leaked), never `403`.

## Retrofit onto M1 routes

M1 controllers already carry `x-rbac` annotations in their OpenAPI (`specs/001-core-work-loop/contracts`).
M0 makes them executable by attaching `@RequirePermission` + the populated `RbacGuard`. Mapping of M1
project-scoped actions to the org-role bypass / project-role fallback:

| M1 action (example) | Org-admin (`isOrgAdmin`) | Non-admin fallback |
|---|---|---|
| create/update/delete project | ✅ allowed | project `ADMIN` |
| create/move/update work item | ✅ allowed | project `MEMBER`+ |
| read board/list/search/comments | ✅ allowed | project `VIEWER`+ |
| change project membership | ✅ allowed | project `ADMIN` |

The **authorization matrix test** (`authz-matrix.spec.ts`, data-model §5) asserts each row of both tables
above, including Viewer-mutation `403` and Owner-only `409`/`403` cases (SC-005/006/007).
