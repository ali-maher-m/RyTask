# Data Model: Fast Capture Everywhere — Slack & MCP (Milestone M3)

**Feature**: `004-fast-capture-slack-mcp` | **Date**: 2026-06-06 | **Phase**: 1 (Design & Contracts)

Unlike 003 (client-only), M3 **does** add persisted server state — but minimally: **two** new
tenant-scoped tables (`slack_workspaces`, `slack_users`), **one** new column (`work_items.source`), and
**one** new enum (`captureSourceEnum`). Personal Access Tokens are the **existing M0** `api_tokens` table
(reused, not new). The MCP "active workspace" is **transient** (per-session, in memory) — no table. All
new tables follow the established conventions: `id` UUIDv7 default, `timestamptz` timestamps,
`organization_id` `NOT NULL` leading every composite index, repositories extend
`TenantScopedRepository`. Schema lives in `packages/db/src/tables.ts` (single source of truth).

---

## 1. New persisted entities

### 1.1 `slack_workspaces` — Slack workspace connection (tenant-scoped)

Links one Slack workspace (team) to one RyTask workspace; holds install/authorization metadata and the
(encrypted) credentials needed to receive commands and reply.

```ts
slackWorkspaces = pgTable('slack_workspaces', {
  id: primaryId(),                                   // uuidv7
  organizationId: uuid('organization_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),       // RyTask workspace this Slack team maps to
  slackTeamId: text('slack_team_id').notNull(),      // Slack 'T…' team id
  slackTeamName: text('slack_team_name').notNull(),
  botUserId: text('bot_user_id').notNull(),          // Slack 'U…' for the bot
  botTokenCiphertext: text('bot_token_ciphertext').notNull(),   // AES-256-GCM (D-research D16/VI)
  botTokenIv: text('bot_token_iv').notNull(),
  botTokenTag: text('bot_token_tag').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  defaultProjectId: uuid('default_project_id'),      // capture routing for the slash path (research D8)
  installedByUserId: uuid('installed_by_user_id').notNull(),  // the admin/install principal
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),  // disconnect = soft revoke
  ...timestamps,
}, (t) => [
  uniqueIndex('slack_ws_team_unique').on(t.slackTeamId),                 // a Slack team connects once
  uniqueIndex('slack_ws_org_team_unique').on(t.organizationId, t.slackTeamId),
  index('slack_ws_org_idx').on(t.organizationId),
  index('slack_ws_org_workspace_idx').on(t.organizationId, t.workspaceId),
]);
```

**Rules**
- `organizationId` + `workspaceId` `NOT NULL`; all reads/writes go through `TenantScopedRepository`.
- `slackTeamId` is globally unique (a Slack team maps to exactly one connection) — the webhook resolves
  `team_id` → this row → `organizationId`/`workspaceId` **server-side** (never client-supplied).
- Bot token is stored **encrypted** (ciphertext/iv/tag); plaintext exists only in memory at call time.
- **Disconnect** sets `revokedAt`, calls Slack token revocation, and stops capture (queued jobs that
  resolve a revoked/absent connection are dropped — no orphaned writes, Edge Cases).
- `defaultProjectId` may be null at connect; capture falls back to a safe default and warns if missing
  or inaccessible (Edge Cases). Reconnect re-activates by inserting/clearing `revokedAt`.

### 1.2 `slack_users` — Slack ↔ RyTask user mapping (tenant-scoped)

Associates a Slack user with a RyTask user for attribution. Auto-created on connect by email match;
manually linkable for the rest. An unmapped Slack user can still capture (with a link prompt).

```ts
slackUsers = pgTable('slack_users', {
  id: primaryId(),
  organizationId: uuid('organization_id').notNull(),
  slackWorkspaceId: uuid('slack_workspace_id').notNull(),  // FK → slack_workspaces.id
  slackUserId: text('slack_user_id').notNull(),            // Slack 'U…'
  slackUserName: text('slack_user_name'),
  slackUserEmail: text('slack_user_email'),
  userId: uuid('user_id'),                                  // mapped RyTask user (null = unmapped)
  mappedManually: boolean('mapped_manually').notNull().default(false),
  ...timestamps,
}, (t) => [
  uniqueIndex('slack_user_org_ws_uid_unique')
    .on(t.organizationId, t.slackWorkspaceId, t.slackUserId),
  index('slack_user_org_idx').on(t.organizationId),
  index('slack_user_org_user_idx').on(t.organizationId, t.userId),
  index('slack_user_email_idx').on(t.organizationId, t.slackUserEmail),
]);
```

**Rules**
- Unique on `(organizationId, slackWorkspaceId, slackUserId)` — one mapping row per Slack user per
  connection (idempotent auto-map; manual re-link updates `userId` + `mappedManually = true`).
- Auto-map on connect: for each Slack workspace user, set `userId` where `slackUserEmail` matches a
  RyTask user's email in the org (FR-SLK-002 / US5 scenario 1).
- `userId = null` is valid (unmapped) — capture still succeeds, attribution falls back, and the captor
  is prompted to link (research D8, US5 scenario 3).

### 1.3 `work_items.source` — capture provenance (new column + enum)

```ts
// packages/db/src/enums.ts
captureSourceEnum = pgEnum('capture_source', ['WEB', 'SLACK', 'MCP', 'API']);

// packages/db/src/tables.ts — added to the existing work_items table
source: captureSourceEnum('source').notNull().default('WEB'),
```

**Rules**
- `NOT NULL`, default `'WEB'` (the existing UI path) — backfills existing rows safely.
- Set by `WorkItemsService.create({ …, source })`: `WEB` (web UI), `API` (non-UI REST / PAT-over-REST),
  `SLACK` (Slack edge), `MCP` (MCP edge). Orthogonal to `reporterId` (who) — `source` is the channel.
- The `CREATED` activity row's `newValue` also records `source` so history is self-describing (research
  D6) — surfaced as a badge (FR-WEB-112 / SC-007).

### 1.4 Reused (NOT new): `api_tokens` (Personal Access Tokens)

The M0 `api_tokens` table already models PATs/MCP tokens: `token_type ∈ {PAT, OAUTH, MCP}`, `scopes`,
`tokenHash` (secret never stored plain), `lastUsedAt`, `expiresAt`, `revokedAt`. M3 **reuses** it for
agent credentials (FR-WEB-111 "building on the existing M0 token management"); the Agent-access UI is a
new surface over the same data. No schema change.

---

## 2. Transient / non-persisted state

### 2.1 MCP session context (active workspace)

```ts
interface McpSessionContext {
  principal: Principal;          // resolved once from the PAT (user/org/role/scopes)
  activeWorkspaceId: string | null;  // defaults to principal.workspaceId / user default
}
```

**Rules**
- Held **per transport session** in memory (HTTP session id / stdio process lifetime); **not** persisted
  (spec marks it transient/selectable). `set_active_workspace` mutates it; subsequent tools default to
  it (FR-MCP-003). A reconnect resets to the token/user default (plan Risks).
- `activeWorkspaceId` must be one the principal can access (validated against `workspaces.list`);
  otherwise the call returns a permission error (research D12).

### 2.2 Slack capture job payload (BullMQ, in-flight)

```ts
interface SlackCaptureJob {
  jobId: string;                 // deterministic: `slack:{teamId}:{kind}:{triggerOrTs}` (idempotency, D7)
  kind: 'slash' | 'modal_submit';
  slackTeamId: string;           // → resolves connection → org/workspace (server-side)
  slackUserId: string;
  channelId: string;
  responseUrl: string;           // where to post the confirmation
  text?: string;                 // slash: the quick-add line
  modal?: { projectId?: string; assigneeId?: string; priority?: string;
            dueDate?: string; title: string; description?: string };
}
```

**Rules**
- Carries only Slack-supplied identifiers; the **org/workspace are re-resolved server-side** from
  `slackTeamId` in the worker (never trusted from the payload beyond the team id used for lookup).
- Enqueued with `jobId` ⇒ a Slack retry can't create a duplicate item (FR-SLK-014). Worker wraps the
  create in `tenant.run(...)` (research D2).

---

## 3. Client-side state & surfaces (web)

These are presentation over server-owned data — **no new persisted client fields** (consistent with the
003 model). Sketches only; full props in `contracts/web-surfaces.md`.

```ts
// settings/integrations (US1) — Slack connection
interface SlackIntegrationState {
  status: 'not_connected' | 'connecting' | 'connected';
  team?: { name: string; connectedAt: string };
  canManage: boolean;            // can('integrations:admin'); cosmetic only
}

// settings/integrations/slack-users (US5) — mapping
interface SlackUsersState {
  rows: Array<{ slackUserId: string; slackUserName?: string; slackUserEmail?: string;
                mappedUserId: string | null; mappedManually: boolean }>;
}

// settings/agent-access (US6) — MCP + PAT
interface AgentAccessState {
  endpoints: { httpUrl: string; stdioHint: string };  // read from server/env-derived config
  steps: string[];               // plain-language connect instructions (Albert/Marissa)
  tokens: ApiTokenDto[];         // reused PAT panel (M0)
  newSecret?: ApiTokenSecret;    // shown exactly once
}

// work-item source badge (US7)
type CaptureSource = 'WEB' | 'SLACK' | 'MCP' | 'API';   // rendered Web / Slack / Agent / API
```

**Rules**
- Admin-only controls (connect/disconnect/map) are gated **cosmetically** by `can()`; the server's
  RBAC guard is authoritative (FR-SLK-004, Principle VI). Non-admins see status read-only (US1 scenario 2).
- The PAT secret is rendered exactly once and never re-fetched (existing M0 behavior; NFR-WEB-005).
- Capability needed: a new `integrations:admin` client capability (maps to org `ADMIN`/`OWNER`) added to
  the capability map; see `contracts/web-surfaces.md`.

---

## 4. Relationships (channel ⇄ domain)

```text
Slack slash/modal ──verify(sig)──▶ ack(≤3s) ──enqueue(jobId)──▶ [BullMQ]
                                                                   │ worker: tenant.run(org,ws,user)
                                                                   ▼
slack_workspaces (team_id→org/ws/defaultProject)        WorkItemsService.create({source:'SLACK', reporter})
slack_users (slack_user→userId | null + prompt)  ───────────────▶ work_items(.source) + activity + reply

MCP client ──PAT──▶ mcp-auth → Principal → tenant.run(org,ws,user) ──▶ same services (source:'MCP')
                                          └ scope ∩ role (default-deny) ┘

Web settings ──REST──▶ slack-admin endpoints (connect/map/disconnect)  +  reused api_tokens endpoints
Item/Activity ──reads──▶ work_items.source ──▶ SourceBadge (Web/Slack/Agent/API)
```

All domain mutations remain the **single** `WorkItemsService` implementation — web, Slack, and MCP are
three clients of one brain (Principle IV; research D1/D5/D9).

---

## 5. Validation & invariants (for the test plan)

| Invariant | Requirement | Where asserted |
|---|---|---|
| `slack_workspaces`/`slack_users` carry `organization_id`; no cross-tenant read/write | FR-X-001, NFR-MT-002, II | `*.tenancy.spec.ts` (both repos) |
| Webhook `team_id` → org resolved server-side; client cannot spoof tenant | II, FR-SLK-014 | slack-capture integration test (forged team) |
| Forged/invalid signature ⇒ rejected, **no** item | FR-SLK-014, SC-006 | `slack-signature.policy` unit + webhook integration |
| Slow capture acks ≤3 s; item created async | FR-SLK-014, SC-006 | webhook integration (ack timing + async create) |
| Same Slack delivery twice ⇒ exactly one item | FR-SLK-014, SC-006 | webhook integration (replay same `jobId`) |
| Title-only / unparseable hints ⇒ created, raw text kept | FR-SLK-012, US2/US3 | capture provider integration + parser unit |
| `source` recorded on item **and** activity (web/slack/mcp/api) | FR-CAP-002, SC-007 | create-work-item integration (all 4 sources) |
| Capture create ≤300 ms p95 server-side | FR-CAP-001, SC-002 | create-work-item perf assertion / load (k6) |
| MCP read-only token cannot mutate (scope ∩ role) | FR-MCP-002, US8.4, SC-004 | MCP auth + per-tool contract tests |
| Cross-tenant access via MCP denied (100%) | FR-X-001, SC-004 | MCP tenant-isolation test |
| Every MCP tool returns typed result / categorized error | FR-MCP-004, US8.4 | per-tool contract tests |
| List/search paged with cursor, never truncated | FR-MCP-005, US4.3 | `list_issues`/`search` contract tests |
| Parity gate green (49/49) after transport lands | IV, FR-INT-MCP-009 | `check-mcp-parity` in CI |
| New web UI is token-only / WCAG AA | FR-X-003, VIII, NFR-WEB-001 | `check-design-tokens` + axe e2e |
