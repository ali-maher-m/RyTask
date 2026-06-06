# Contract: Web surfaces (Integrations, Slack mapping, Agent access, source badge)

**Feature**: `004-fast-capture-slack-mcp` | FR-WEB-101/102/103/110/111/112 | research D15–D17 | extends
the 003 web app (`specs/003-frontend-m0-m1/contracts/*`)

Four new client-edge surfaces, built on the 003 settings shell (`page.tsx` + `*-client.tsx`), the
`@rytask/ui` token-driven primitives, the `lib/api/*` typed clients, and the cosmetic `can()` capability
map. The server stays authoritative; all gating here is presentation only (Principle VI).

## 1. Route map (additions)

| Path | Surface | US / FR | Min role (cosmetic) | Consumes |
|---|---|---|---|---|
| `/settings/integrations` | Slack connect / status / disconnect | US1 / FR-WEB-101, FR-WEB-103 | view: any member; manage: admin | `GET/PATCH/DELETE /integrations/slack`, `GET /integrations/slack/install` |
| `/settings/integrations/slack-users` | Slack ↔ user mapping | US5 / FR-WEB-102 | admin | `GET /integrations/slack/users`, `POST/DELETE …/users/{id}/map`, members list |
| `/settings/agent-access` | MCP endpoint + steps + PAT panel | US6 / FR-WEB-110, FR-WEB-111 | any member (own tokens) | reused `GET/POST/DELETE /api-tokens` + server MCP-endpoint config |
| (on item detail/list & activity) | capture **source badge** | US7 / FR-WEB-112 | any (read) | `work_items.source` (already in the item payload) |

**Nav**: add **Integrations** and **Agent access** entries to the app-shell settings nav; show them per
`can()` (Integrations management → admins; Agent access → all, since every user manages own PATs).

## 2. Role-capability additions (cosmetic — mirrors server RBAC)

Add one client capability to `lib/auth/capabilities.ts` (server remains the authority):

```ts
// new capability
'integrations:admin'   // connect / disconnect / map Slack — maps to org ADMIN | OWNER
// reused
'tokens:write'         // create/revoke own PATs (existing M0)
```

| Capability | OWNER | ADMIN | MEMBER | GUEST | VIEWER |
|---|:--:|:--:|:--:|:--:|:--:|
| `integrations:admin` | ✓ | ✓ | — | — | — |
| view Slack status | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tokens:write` (own PATs) | ✓ | ✓ | ✓ | ✓ | ✓ |

`reason('integrations:admin')` → "Only owners and admins can manage integrations." Non-admins see the
Integrations page **read-only** (status + team name), with the connect/disconnect controls rendered
disabled-with-reason (US1.2). Server returns `403` if a non-admin calls a mutation anyway (reconciled
with a kind error — the 003 `FR-WEB-100` pattern).

## 3. Component contracts (token-only, a11y, plain copy — Principle VIII)

### A. `IntegrationsClient` (US1)
```ts
interface IntegrationsClient {
  // states: not_connected | connecting | connected
  // connected: show team name + connectedAt (useOrg().formatDate), defaultProject picker (admin)
  onConnect(): void;        // → GET /integrations/slack/install (full-page redirect to Slack)
  onDisconnect(): void;     // confirm dialog → DELETE /integrations/slack (clear consequence, FR-WEB-103)
  onSetDefaultProject(id): void;  // PATCH
}
```
- Uses `Badge` for status, `Button` (primary = Sunbeam + dark ink) for "Connect Slack", `Dialog` for the
  disconnect confirmation ("This stops Slack capture until you reconnect.").
- Reads `?connected=1` / `?error=` from the OAuth return and shows a one-line result (no secrets in URL).

### B. `SlackUsersClient` (US5)
```ts
interface SlackUsersClient {
  rows: SlackUserMappingDto[];           // mapped + unmapped
  onMap(slackUserId, userId): void;      // POST …/map
  onUnmap(slackUserId): void;            // DELETE …/map
}
```
- Table of Slack users (name/email) with a member `Select` to link; mapped rows show a `Badge` (auto vs
  manual); unmapped rows are highlighted as "needs linking". `EmptyState` when not connected.

### C. `AgentAccessClient` (US6)
```ts
interface AgentAccessClient {
  endpoints: { httpUrl: string; stdioHint: string };
  steps: string[];                        // ≤5 plain steps (SC-005, Albert/Marissa)
  // reuses the M0 TokensPanel:
  tokens: ApiTokenDto[];
  onCreate(input: CreateApiToken): void;  // shows ApiTokenSecret exactly once
  onRevoke(id): void;
}
```
- Connection instructions are plain language with copy-to-clipboard for the endpoint (mono font via the
  existing figure/`--font-mono` treatment); the **PAT panel is the existing M0 component** (reused, not
  rebuilt — research D15). PAT secret shown once, never re-fetched (NFR-WEB-005).

### D. `SourceBadge` (US7) — see `capture-source.md`
```ts
function SourceBadge({ source }: { source: 'WEB' | 'SLACK' | 'MCP' | 'API' }): JSX.Element;
// renders: Web | Slack | Agent | API  — token-only Badge, text label (not color-only)
```
- Rendered on item detail/list and inside the `CREATED` activity entry. Uses `var(--info-soft)` /
  `var(--info-fg)` (a permitted hue); carries a **text label** so it passes WCAG (not color-alone).

## 4. Cross-cutting obligations

- **Token-only styling**: every value is a semantic `var(--*)`; `check-design-tokens` must pass (no raw
  hex/px, no gradient/blur/floaty-shadow/non-system-font/emoji-chrome).
- **A11y**: full keyboard operability, visible focus, `Dialog` focus-trap, `role="alert"` for errors,
  `prefers-reduced-motion` honored; axe scans on the connect-Slack and Agent-access journeys.
- **Voice**: sentence case, kind, jargon-free — "Connect Slack", "Connected to {team}", "Link account",
  "Create token". Passes the Albert/Marissa test.
- **Optimistic/reconcile**: mutations reconcile to server `403`/`409` with a friendly revert (003
  pattern). No secret in any URL or client log.

## 5. Tests (declared in `apps/web/web.testplan.ts` — Principle V)

| Test | Asserts |
|---|---|
| `connect-slack.e2e.spec.ts` | admin sees Connect; completes (stubbed OAuth return) → "Connected"; non-admin sees read-only (US1) + axe |
| `slack-users.component/e2e` | list, map, unmap; unmapped highlighted (US5) |
| `agent-access.e2e.spec.ts` | endpoint + steps shown; create PAT shows secret once; revoke; connect an MCP client conceptually (US6) + axe |
| `source-badge.component` | renders Web/Slack/Agent/API with text label; token-only (US7) |
| capability map unit | `integrations:admin` gates correctly per role (cosmetic) |
