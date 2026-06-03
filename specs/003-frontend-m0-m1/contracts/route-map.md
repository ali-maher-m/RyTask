# Contract: Route Map (addressable surfaces)

**Feature**: `003-frontend-m0-m1` | FR-WEB-001/002/003

Every authenticated surface lives under the `(app)` route group and renders inside the persistent
shell (D6); auth, setup, and invite surfaces render bare. Stable, shareable URLs restore the same
surface on reload, subject to permission (FR-WEB-003). Deep links to a forbidden / cross-tenant
resource resolve to a friendly not-found/forbidden surface and render **zero** foreign data
(FR-WEB-101). The session is a `localStorage` bearer token, so gating is the client `RequireAuth`
component (no `middleware.ts` — D18).

## Routing state machine (FR-WEB-002)

```
visit any route
  ├─ instance has no org (GET /setup → open)         → /setup            (never re-offered once closed)
  ├─ protected route & no access token               → /login?next=<dest> (return to <dest> after sign-in)
  └─ authenticated                                   → requested surface (shell)
```

## Public surfaces (no shell, unauthenticated)

| Path | Surface | US / FR | Consumes |
|---|---|---|---|
| `/setup` | First-run wizard (org+owner+starter project) | US1 / FR-WEB-010 | `GET/POST /setup` |
| `/login` | Sign-in (+ `?next=` return) | US1 / FR-WEB-011/012 | `POST /auth/login`, `/auth/refresh` |
| `/register` | Self-registration (when org allows) | US1 / FR-WEB-011 | `POST /auth/register` |
| `/reset` | Forgot-password request (no enumeration) | US12 / FR-WEB-013 | `POST /auth/request-password-reset` |
| `/reset/confirm` | Reset-confirm (consume token, set password) | US12 / FR-WEB-013 | `POST /auth/confirm-password-reset` |
| `/verify` | Email verification | US12 / FR-WEB-013 | `POST /auth/verify-email` |
| `/invite/[token]` | Accept-invite landing (preview → accept) | US9 / FR-WEB-071 | `GET /invites/{t}`, `POST /invites/{t}/accept` |

## Authenticated surfaces (shell, gated by `RequireAuth` + capability map)

| Path | Surface | US / FR | Min role | Consumes |
|---|---|---|---|---|
| `/` | Redirect → `/my-work` | — | any | — |
| `/my-work` | Cross-project "My Work" | US6 / FR-WEB-053 | any | `GET /work-items?smart=my-issues` |
| `/inbox` | Notification inbox | US10 / FR-WEB-082 | any | `GET /notifications`, mark/snooze/archive |
| `/projects` | Project list / switcher | US6 / FR-WEB-050 | any (member-scoped) | `GET /projects` |
| `/projects/new` | Create project | US6 / FR-WEB-050 | project:create | `POST /projects` |
| `/projects/[projectId]/board` | Kanban board (drag, group-by) | US4 / FR-WEB-030 | viewer+ | `GET /work-items`, `POST /work-items/{id}/move` |
| `/projects/[projectId]/list` | List (inline edit, group sections) | US4 / FR-WEB-031 | viewer+ | `GET /work-items`, `PATCH /work-items/{id}` |
| `/projects/[projectId]/items/[key]` | Item detail (fields, md, subtasks, dates, activity, comments, trash) | US3/US8/US10 / FR-WEB-022/023/060/061/080 | viewer+ | `GET/PATCH /work-items/{id}`, subtasks, comments, activity |
| `/projects/[projectId]/settings` | Project settings (statuses, labels, membership) | US6 / FR-WEB-051/052 | project:admin | statuses, labels, members endpoints |
| `/projects/[projectId]/trash` | Restore soft-deleted items | US3 / FR-WEB-023 | member+ | restore endpoint |
| `/views/[viewId]` | A saved view (personal/shared) | US7 / FR-WEB-042 | per scope | `GET /views/{id}`, `GET /work-items?filter=` |
| `/search?q=` | Full-text search results | US11 / FR-WEB-091 | any (scoped) | `GET /search` |
| `/settings/organization` | Org settings (name, slug, logo, tz, locale, week-start, hours) | US9 / FR-WEB-073 | org:settings:write | `GET/PATCH /orgs/current` |
| `/settings/members` | Members (roles, remove, transfer; last-owner guard) | US9 / FR-WEB-072 | members:read; write gated | members endpoints |
| `/settings/tokens` | Personal Access Tokens (create once, list, revoke) | US9 / FR-WEB-074 | tokens:write (self) | `GET/POST/DELETE /tokens` |
| `/health` | Liveness page (smoke) | — | any | `GET /health` |

## Global affordances (every authed surface)

- **Quick-add** — capture into the current project (US2 / FR-WEB-020).
- **Command palette** — `Cmd/Ctrl-K` navigate-or-create in ≤2 actions (US11 / FR-WEB-090).
- **Theme toggle** — light/dark (Principle VIII / D3).
- **Org + user context, sign-out** — in the shell (FR-WEB-001).

## Gating rules

1. **Auth gate**: every authenticated path requires a token; otherwise `→ /login?next=`.
2. **Capability gate (cosmetic)**: controls/nav for actions the role can't perform are hidden/disabled
   with a reason (`role-capability-matrix.md`); the server still enforces (FR-WEB-100).
3. **Tenant/permission gate (authoritative)**: a `404`/`403` from the API renders the friendly
   not-found/forbidden surface — never foreign data (FR-WEB-101).
4. **State coverage**: every surface defines loading/empty/forbidden/error (FR-WEB-102).
