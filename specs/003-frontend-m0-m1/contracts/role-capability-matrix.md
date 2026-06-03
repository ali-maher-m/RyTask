# Contract: Client Role-Capability Matrix (cosmetic gating)

**Feature**: `003-frontend-m0-m1` | FR-WEB-100, US5 | mirrors `specs/002-identity-tenancy-onboarding/contracts/rbac-matrix.md`

This is the client-side `capabilities(role)` map that hides/disables controls a role cannot use. It is
a **usability courtesy, never the real control** — the server's `RbacGuard` is default-deny and
authoritative (Principle VI). Whenever a hidden/edge action still reaches the server, the UI handles
the `403`/`409` gracefully (revert + kind, plain-language message — FR-WEB-100/103).

## Org-role capabilities (✅ control shown/enabled · ❌ hidden or disabled-with-reason)

| Capability (UI control) | OWNER | ADMIN | MEMBER | GUEST | VIEWER |
|---|:--:|:--:|:--:|:--:|:--:|
| Read org / workspace / boards / items / search | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comment (where org toggle enables) | ✅ | ✅ | ✅ | ✅ | ✅* |
| Own PATs (create/list/revoke) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `members:read` (see members surface) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create/move/update/delete work items | ✅ | ✅ | ✅** | ❌ | ❌ |
| Create/edit/archive/delete project | ✅ | ✅ | ✅** | ❌ | ❌ |
| Edit project settings (statuses, labels, membership) | ✅ | ✅ | ✅** | ❌ | ❌ |
| `org:settings:write` (org settings) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `members:invite` (invite by email/link) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `members:write` (change role / remove) | ✅ | ✅*** | ❌ | ❌ | ❌ |
| `org:transfer` (transfer ownership) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `org:delete` (delete organization) | ✅ | ❌ | ❌ | ❌ | ❌ |

\* **VIEWER is read-only** — every mutating control is non-actionable; commenting is allowed only if
the org's comment toggle is on (enforced server-side in M1 comments).
\** **MEMBER** project actions defer to **project role**: OWNER/ADMIN bypass project-role checks;
otherwise project-scoped writes need project `MEMBER`+ (items) / project `ADMIN` (project & settings &
membership), per the M0 retrofit table. The client mirrors `principal.role` + the project membership
it already fetched.
\*** An **ADMIN cannot change/remove an OWNER**; **no actor can demote/remove the last OWNER** — those
controls are disabled with an explanation (`LastOwnerPolicy`; the server returns `409`).

## Project-role fallback (when org role is not OWNER/ADMIN)

| Action | Needs project role |
|---|---|
| Read board/list/search/comments | project `VIEWER`+ |
| Create/move/update work item | project `MEMBER`+ |
| Create/update/delete project · change membership · edit statuses/labels | project `ADMIN` |

## Client contract

```ts
function can(role: Role, cap: Capability, ctx?: {
  projectRole?: ProjectRole;     // from the fetched project membership
  targetRole?: Role;             // for members:write (can't touch an OWNER as ADMIN)
  isLastOwner?: boolean;         // disable demote/remove of the only OWNER
}): boolean;

function reason(cap: Capability): string;   // e.g. "Only owners and admins can invite teammates."
```

### Rules the map MUST encode (asserted by the capability-map unit test)
1. **Default-deny parity**: any capability not listed ✅ for a role → control not actionable.
2. **VIEWER read-only**: all mutating capabilities ❌ regardless of project role.
3. **Org-admin bypass**: OWNER/ADMIN satisfy project-scoped writes without a project role.
4. **Owner-only**: `org:transfer`, `org:delete` only for OWNER.
5. **Admin-vs-owner**: ADMIN's `members:write` is ❌ when `targetRole === 'OWNER'`.
6. **Last-owner guard**: demote/remove disabled when `isLastOwner`.
7. **Cosmetic-only**: the map never blocks a request by itself; it only chooses what to render. The
   server decision (200/403/404/409) always wins, and the UI reconciles to it.
