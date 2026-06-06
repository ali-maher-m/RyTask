# Contract: Slack REST surface (OAuth, webhooks, admin)

**Feature**: `004-fast-capture-slack-mcp` | FR-SLK-001/003/004, FR-WEB-101/102/103 | new endpoints under
the `slack` module

All routes are served by the existing `api` process under the global `/api/v1` prefix **except** the
Slack-facing OAuth + webhook routes, which Slack calls directly (documented paths below). Admin routes
are RBAC-guarded (`org:settings:write` / admin role); webhook routes are **signature-guarded** (see
`slack-capture-flow.md`); the install route is admin-guarded then redirects to Slack.

## A. OAuth install & callback (US1 / FR-SLK-001, research D16)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/integrations/slack/install` | session, `org:settings:write` | Build Slack consent URL with a signed `state` nonce bound to `{organizationId, workspaceId, adminUserId, exp}`; `302` redirect to Slack |
| `GET` | `/integrations/slack/oauth/callback` | Slack redirect (validates `state`) | Exchange `code` → bot token; persist `slack_workspaces` (encrypted token), auto-map users by email; `302` back to `/settings/integrations?connected=1` |

**Install rules**
- Only an admin may start the flow (server-enforced; the UI hides it cosmetically for others — US1.2).
- `state` is an HMAC-signed, short-TTL nonce (CSRF + org binding); the callback **rejects** an invalid/
  expired/mismatched `state` with no partial connection recorded (Edge Case: consent declined/interrupted).

**Callback rules**
- On success: insert/reactivate `slack_workspaces` (one row per `slack_team_id`; clear `revokedAt` on
  reconnect), store the bot token **encrypted** (AES-256-GCM), then run email auto-mapping into
  `slack_users` (FR-SLK-002). Redirect to the settings page showing "Connected" + team name.
- On Slack error / user-declined: record **nothing**; redirect to `/settings/integrations?error=…`
  (page still shows "Not connected").
- Idempotent: re-running the flow for an already-connected team updates metadata, never duplicates.

## B. Slash command & interactivity webhooks (US2/US3/US8 — detailed in `slack-capture-flow.md`)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| `POST` | `/integrations/slack/commands` | `SlackSignatureGuard` | `/task …` slash command (slash capture or open modal) |
| `POST` | `/integrations/slack/interactivity` | `SlackSignatureGuard` | Modal `view_submission` (and future block actions) |

These **must** read the raw request body (signature is over exact bytes) and **ack within 3 s**; all
real work is queued. Full behavior, payloads, idempotency, and Block Kit are in `slack-capture-flow.md`.

## C. Admin management REST (US1/US5 / FR-WEB-101/102/103, FR-SLK-003/004)

All require an authenticated session; mutations require admin (`org:settings:write`). Tenant is the
caller's resolved org (Principle II). DTOs live in `packages/contracts/src/slack.contract.ts`.

| Method | Path | Min role | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/integrations/slack` | any member | Connection status (`not_connected`/`connected`, team name, connectedAt, defaultProjectId) — read-only for non-admins (US1.2) |
| `PATCH` | `/api/v1/integrations/slack` | admin | Update connection settings (e.g. `defaultProjectId`) |
| `DELETE` | `/api/v1/integrations/slack` | admin | **Disconnect**: revoke Slack token, set `revokedAt`, stop capture (FR-SLK-003); queued jobs for the team become no-ops |
| `GET` | `/api/v1/integrations/slack/users` | admin | List `slack_users` rows (mapped + unmapped) for the connection |
| `POST` | `/api/v1/integrations/slack/users/{slackUserId}/map` | admin | Link a Slack user to a RyTask `userId` (`mappedManually = true`) — FR-SLK-002 / US5.2 |
| `DELETE` | `/api/v1/integrations/slack/users/{slackUserId}/map` | admin | Unlink (set `userId = null`) |

### DTO shapes (`packages/contracts/src/slack.contract.ts`)

```ts
export interface SlackConnectionDto {
  status: 'not_connected' | 'connected';
  team: { id: string; name: string } | null;
  connectedAt: string | null;
  defaultProjectId: string | null;
}

export interface SlackUserMappingDto {
  slackUserId: string;
  slackUserName: string | null;
  slackUserEmail: string | null;
  mappedUserId: string | null;       // null = unmapped (capture still works; user prompted to link)
  mappedManually: boolean;
}

export const updateSlackConnectionSchema = z
  .object({ defaultProjectId: z.string().uuid().nullable().optional() })
  .strict();

export const mapSlackUserSchema = z
  .object({ userId: z.string().uuid() })
  .strict();
```

### Response & error conventions (mirror M0/M1)

- Success envelopes match the existing REST shape (`{ data, meta? }`); list endpoints reuse keyset
  pagination where lists can grow (Slack users).
- `400` strict-schema (unknown field) / `401` unauthenticated / `403` non-admin mutation /
  `404` no connection / `409` already-connected conflict where relevant — same mapping as M0/M1.
- No secret (bot token, signing secret) ever appears in any response or log (Principle VI).

## Endpoint → requirement → test map

| Endpoint | Requirement | Contract test |
|---|---|---|
| install / oauth callback | FR-SLK-001, FR-WEB-101 | `slack-oauth.controller.contract.spec.ts` (admin-gate, state validation, no-partial-on-decline) |
| `GET /integrations/slack` | FR-WEB-101 | status visible to all; mutate hidden for non-admin |
| `DELETE /integrations/slack` | FR-SLK-003, FR-WEB-103 | revoke + capture-stops + admin-only |
| `GET/POST/DELETE …/users[/map]` | FR-SLK-002, FR-WEB-102, US5 | list/map/unlink + admin-only + tenancy-scoped |
| `POST …/commands`, `…/interactivity` | FR-SLK-010/011/014 | see `slack-capture-flow.md` |
