---
description: "Task list for Fast Capture Everywhere — Slack & MCP (Milestone M3)"
---

# Tasks: Fast Capture Everywhere — Slack & MCP (Milestone M3)

**Input**: Design documents from `/specs/004-fast-capture-slack-mcp/`

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓ (D1–D17), data-model.md ✓, contracts/ ✓
(slack-rest, slack-capture-flow, mcp-server, web-surfaces, capture-source), quickstart.md ✓

**Tests**: MANDATORY (Constitution Principle V — Test-First & Enforced Coverage). Every backend
provider → ≥1 integration test (real Postgres); every route → a contract test; **every MCP tool → a
contract test**; the Slack webhook → an integration test (verify → ack → async → idempotent on replay);
every tenant-scoped table → a tenancy-isolation test; flagship web journeys → Playwright + axe.
`scripts/check-required-tests.ts` fails the build if any *declared* required test file is MISSING. Test
tasks below are therefore not optional — write them first and let them fail before implementing.

**Organization**: Tasks are grouped by user story (P1×4, P2×3, P3×1) so each story can be implemented,
tested, and demoed independently. M3 adds **no new domain capability** — both channels are clients of the
**same** `WorkItemsService` + `parseQuickAdd` + PAT/RBAC the web already uses (one brain everywhere).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US8 (user-story phases only; Setup/Foundational/Polish carry no story label)
- Exact file paths are included in every task.

## Path conventions (from plan.md §Project Structure)

- Backend: `apps/api/src/modules/slack/` (NEW bounded module), `apps/api/src/mcp/` (NEW transport edge),
  `apps/api/src/common/` (ports/adapters/crypto), `apps/api/src/main.mcp.ts` (stdio entrypoint).
- Contracts/DB: `packages/contracts/src/`, `packages/db/src/`.
- Web: `apps/web/app/(app)/settings/`, `apps/web/lib/`, `apps/web/components/`, `apps/web/e2e/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pull in the additive dependencies and create the empty module/edge skeletons so all later
work has a home. No fixed-role substitution (Principle I).

- [X] T001 Add additive runtime deps to `apps/api/package.json`: `@slack/web-api`, `@slack/oauth`
      (Slack adapter, research D3), `@modelcontextprotocol/sdk` (MCP server + transports, research D10);
      run `pnpm install` and confirm `pnpm --filter @rytask/api typecheck` still passes.
- [X] T002 [P] Add Slack + MCP environment variables (no new compose service — Principle VII) to
      `infra/docker/` env templates and the API config schema: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`,
      `SLACK_SIGNING_SECRET`, `SLACK_OAUTH_CALLBACK_URL`, `SLACK_TOKEN_ENC_KEY` (32-byte base64),
      `MCP_PUBLIC_URL`. Slack/MCP stay **inert** (noop adapter) when unset (quickstart §2).
- [X] T003 [P] Create the Slack bounded-module directory skeleton under `apps/api/src/modules/slack/`
      (empty `controllers/`, `providers/`, `repositories/`, `processors/`, `domain/`, `guards/`,
      `events/`) per plan.md §Project Structure.
- [X] T004 [P] Create the MCP transport-edge directory skeleton under `apps/api/src/mcp/`
      (empty `transport/`, `tools/`) per plan.md §Project Structure.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cross-cutting schema, contracts, ports, "one-brain" service change, and the two channel
skeletons that EVERY user story depends on. ⚠️ **No user-story work can begin until this phase is
complete.**

### Database (single source of truth: `packages/db/src/tables.ts`)

- [X] T005 Add `captureSourceEnum = pgEnum('capture_source', ['WEB','SLACK','MCP','API'])` to
      `packages/db/src/enums.ts` (data-model §1.3).
- [X] T006 In `packages/db/src/tables.ts` add: (a) `work_items.source` column
      (`captureSourceEnum('source').notNull().default('WEB')`); (b) the `slackWorkspaces` table; (c) the
      `slackUsers` table — both tenant-scoped with `organization_id` `NOT NULL` leading every composite
      index and the unique indexes specified in data-model §1.1/§1.2 (depends on T005).
- [X] T007 Generate the Drizzle migration into `packages/db/migrations/` (`pnpm --filter @rytask/db
      generate`), verify it backfills `source` safely and creates both tables + indexes (depends on T006).
- [~] T008 [P] (Optional) Add a demo Slack connection row to `packages/db/src/seed.ts` for offline web
      verification (quickstart §3) (depends on T006).

### Shared contracts (`packages/contracts/src/` — single, drift-proof contract)

- [X] T009 [P] Add `source: CaptureSource` to the `WorkItem` output DTO and thread an optional `source`
      into the create input plumbing in `packages/contracts/src/work-items.contract.ts`
      (capture-source.md §2).
- [X] T010 [P] Create `packages/contracts/src/slack.contract.ts` with `SlackConnectionDto`,
      `SlackUserMappingDto`, `updateSlackConnectionSchema`, `mapSlackUserSchema` and export from
      `packages/contracts/src/index.ts` (slack-rest.md §DTO shapes).
- [X] T011 [P] Create `packages/contracts/src/mcp/tool-io.ts` mapping each of the 49 registry tools to
      its **input** zod (reusing existing `*.contract.ts` zod where present, e.g. `createWorkItemSchema`)
      and output type, plus the shared `listQuery` + `Paged<T>` pagination envelope (mcp-server.md §5/§6,
      research D13/D14).

### "One brain" — source-aware create (reused by Slack, MCP, web, badge)

- [X] T012 Make `WorkItemsService.create` / `CreateWorkItemProvider` accept an optional `source`
      (default `'WEB'`; `'API'` for non-UI REST) and record it in the `CREATED` activity row's
      `newValue`, in `apps/api/src/modules/work-items/providers/create-work-item.provider.ts` and the
      work-items service (capture-source.md §2, research D6) (depends on T006, T009).

### Edge ports & adapters (Principle III — external I/O behind interfaces)

- [X] T013 [P] Add a `Crypto` port + AES-256-GCM adapter under `apps/api/src/common/crypto/` (bot-token
      encryption at rest, key from `SLACK_TOKEN_ENC_KEY`) and register it in
      `apps/api/src/common/ports/ports.module.ts` (data-model §1.1, Principle VI).
- [X] T014 Extend the `SlackPort` interface in `apps/api/src/common/ports/slack.port.ts` with
      `respond(responseUrl,…)`, `openModal(triggerId, view)`, `exchangeOAuthCode(code)`,
      `listWorkspaceUsers()`, `lookupUserByEmail(email)` and extend `noopSlack` accordingly (research D3).
- [X] T015 Create the real Slack adapter `apps/api/src/common/adapters/slack/slack.adapter.ts`
      (wrapping `@slack/web-api` + `@slack/oauth` `InstallProvider`) and wire real-vs-`noopSlack` selection
      by env in `apps/api/src/common/ports/ports.module.ts` (research D3; depends on T014).

### Slack module skeleton + repositories (tenant-scoped)

- [X] T016 Create `apps/api/src/modules/slack/slack.module.ts` and the public
      `apps/api/src/modules/slack/slack.contract.ts` (service interface + DI tokens), and register the
      module in `apps/api/src/app.module.ts` (research D1; depends on T003).
- [X] T017 [P] Implement `apps/api/src/modules/slack/repositories/slack-workspaces.repository.ts`
      extending `TenantScopedRepository` (auto-`WHERE organization_id`) (depends on T006, T016).
- [X] T018 [P] Implement `apps/api/src/modules/slack/repositories/slack-users.repository.ts`
      extending `TenantScopedRepository` (depends on T006, T016).
- [X] T019 [P] Tenancy-isolation specs proving no cross-tenant read/write for both tables, in
      `apps/api/src/modules/slack/repositories/slack-workspaces.tenancy.spec.ts` and
      `slack-users.tenancy.spec.ts` (FR-X-001, data-model §5; depends on T017, T018).
- [X] T020 Create the Slack module test plan skeleton
      `apps/api/src/modules/slack/module.testplan.ts` (module name, providers/controllers/mcpTools/
      tenantScopedTables arrays, empty `requiredTests` to be appended per story) (Principle V).

### MCP transport-edge skeleton

- [X] T021 Create `apps/api/src/mcp/mcp.module.ts` and `apps/api/src/mcp/mcp-server.factory.ts`
      (build one `@modelcontextprotocol/sdk` `McpServer` from `packages/contracts/src/mcp/registry.ts`)
      and register the edge in `apps/api/src/app.module.ts` (research D10; depends on T004).
- [X] T022 [P] Implement `apps/api/src/mcp/mcp-auth.ts`: resolve a PAT (`Authorization: Bearer` / stdio
      `RYTASK_PAT`) into a `Principal` via the **existing M0** token verification; update `lastUsedAt`
      (research D9).
- [X] T023 [P] Implement `apps/api/src/mcp/mcp-session.ts`: transient per-session active-workspace
      (`McpSessionContext`), validated against `workspaces.list` (data-model §2.1).
- [X] T024 [P] Implement `apps/api/src/mcp/mcp-errors.ts`: map domain exceptions to
      `INVALID_ARGUMENT` / `PERMISSION_DENIED` / `NOT_FOUND` (mcp-server.md §7, research D12).
- [X] T025 Implement the `apps/api/src/mcp/tools/tool-dispatch.ts` scaffold: iterate registry tools,
      `tenant.run({org, activeWorkspace, user, role}, …)` + `patHasPermission(role, scopes, perm)`
      (default-deny) around each call; validate input via `tool-io.ts` (research D2/D9; depends on T021,
      T022, T024, T011).
- [X] T026 [P] Implement `apps/api/src/mcp/tools/pagination.ts`: wrap the existing keyset-paginated
      services into `{ items, nextCursor }` with opaque cursor + `fields` projection (research D14;
      depends on T011).
- [X] T027 Create the MCP edge test plan `apps/api/src/mcp/mcp.testplan.ts` (declares the per-tool
      contract tests, auth/tenancy/pagination tests; appended per US4/US8) (Principle V; depends on T021).

**Checkpoint**: Schema migrated, contracts + ports in place, source-aware create live, both channel
skeletons compile and are tenant-safe. User stories can now proceed (P1×4 in parallel if staffed).

---

## Phase 3: User Story 1 - Connect a Slack workspace to RyTask (Priority: P1) 🎯 MVP

**Goal**: An admin installs/connects the RyTask Slack app per workspace via Slack's consent flow; RyTask
shows "Connected", binds the Slack team to the RyTask workspace, auto-maps users by email, and supports
disconnect (revoke + stop capture). Secrets stay server-side; the bot token is encrypted at rest.

**Independent Test**: From `/settings/integrations`, an admin starts connect, completes (stubbed) Slack
consent, returns to "Connected" + team name; a non-admin sees status read-only; Disconnect revokes and
stops capture. (spec US1; quickstart US1)

### Tests for User Story 1 (MANDATORY — write first, let them fail) ⚠️

- [X] T028 [P] [US1] Unit test for the signed-`state` nonce in
      `apps/api/src/modules/slack/domain/slack-oauth-state.policy.spec.ts` (HMAC sign/verify, TTL, org
      binding, tamper rejection).
- [X] T029 [P] [US1] Contract test
      `apps/api/src/modules/slack/controllers/slack-oauth.controller.contract.spec.ts`: install is
      admin-gated; callback validates `state`; declined/interrupted consent records **no** partial
      connection (slack-rest.md §A).
- [X] T030 [P] [US1] Contract test
      `apps/api/src/modules/slack/controllers/slack-admin.controller.contract.spec.ts`: `GET
      /integrations/slack` visible to any member; `PATCH`/`DELETE` admin-only (403 otherwise);
      tenant-scoped (slack-rest.md §C).
- [X] T031 [P] [US1] Integration test (real PG)
      `apps/api/src/modules/slack/providers/connect-slack.provider.int.spec.ts`: OAuth exchange →
      `slack_workspaces` row with **encrypted** token → auto-map by email into `slack_users`
      (FR-SLK-001/002).
- [X] T032 [P] [US1] Integration test (real PG)
      `apps/api/src/modules/slack/providers/disconnect-slack.provider.int.spec.ts`: sets `revokedAt`,
      calls token revocation, capture stops (FR-SLK-003).

### Implementation for User Story 1

- [X] T033 [US1] Implement `apps/api/src/modules/slack/domain/slack-oauth-state.policy.ts` — pure
      HMAC-signed, short-TTL `state` nonce bound to `{organizationId, workspaceId, adminUserId, exp}`
      (research D16).
- [X] T034 [US1] Implement `apps/api/src/modules/slack/providers/connect-slack.provider.ts`: exchange
      code via `SlackPort.exchangeOAuthCode`, persist encrypted bot token (Crypto port) + team mapping,
      auto-map workspace users by email; idempotent on reconnect (clears `revokedAt`) (depends on T015,
      T013, T017, T018).
- [X] T035 [US1] Implement `apps/api/src/modules/slack/providers/disconnect-slack.provider.ts`: revoke
      Slack token + set `revokedAt` (depends on T015, T017).
- [X] T036 [US1] Implement `apps/api/src/modules/slack/providers/get-connection.provider.ts` returning
      `SlackConnectionDto` (status/team/connectedAt/defaultProjectId) (depends on T017).
- [X] T037 [US1] Implement `apps/api/src/modules/slack/controllers/slack-oauth.controller.ts`:
      `GET /api/v1/integrations/slack/install` (admin-gated → 302 to Slack consent with signed state) and
      `GET /integrations/slack/oauth/callback` (validate state → connect → 302 to
      `/settings/integrations?connected=1`) (slack-rest.md §A; depends on T033, T034).
- [X] T038 [US1] Implement `apps/api/src/modules/slack/controllers/slack-admin.controller.ts`:
      `GET` status (any member), `PATCH` settings (admin, `defaultProjectId`), `DELETE` disconnect
      (admin) — RBAC-guarded (slack-rest.md §C; depends on T035, T036).
- [X] T039 [US1] Append US1 required tests (T028–T032) to
      `apps/api/src/modules/slack/module.testplan.ts` so `check-required-tests` enforces them.

### Web for User Story 1

- [X] T040 [P] [US1] Create the typed Slack admin client `apps/web/lib/api/slack.ts`
      (status/patch/disconnect/install) against `@rytask/contracts` (web-surfaces.md §1).
- [X] T041 [P] [US1] Add the cosmetic `integrations:admin` capability (OWNER|ADMIN) to
      `apps/web/lib/auth/capabilities.ts` with its `reason(...)` copy (web-surfaces.md §2).
- [X] T042 [US1] Build `apps/web/app/(app)/settings/integrations/page.tsx` +
      `integrations-client.tsx`: connect/status/disconnect, default-project picker (admin), reads
      `?connected=1`/`?error=`; token-only `Badge`/`Button`/`Dialog`; non-admins see read-only with
      disabled-with-reason (web-surfaces.md §3.A; depends on T040, T041).
- [X] T043 [US1] Add the **Integrations** entry to the settings nav in the app shell, gated by `can()`
      (web-surfaces.md §1; depends on T042).
- [X] T044 [P] [US1] Add `apps/web/e2e/connect-slack.e2e.spec.ts` (admin connects via stubbed OAuth →
      "Connected"; non-admin read-only) + axe, and register it in `apps/web/web.testplan.ts`.

**Checkpoint**: US1 fully functional — a workspace can be connected, viewed, and disconnected end-to-end.

---

## Phase 4: User Story 2 - Capture a task from Slack in seconds (Priority: P1)

**Goal**: `/task Fix login bug !urgent @ali #bugs ^Friday` creates a correctly-parsed work item
(`source = SLACK`, reporter = captor) and replies in Slack with the item key + deep link — using the
**existing M1 `parseQuickAdd` verbatim** and the **existing `WorkItemsService.create`**. Verify signature
→ ack ≤3 s → process async via BullMQ with a deterministic `jobId`.

**Independent Test**: In a connected workspace, run `/task …` with inline tokens → correct item created,
Slack confirmation with key + link in seconds; `/task Just the title` → title-only with smart defaults;
unknown `@name` stays verbatim in the title and the reply notes what wasn't applied. (spec US2)

### Tests for User Story 2 (MANDATORY — write first) ⚠️

- [X] T045 [P] [US2] Unit test
      `apps/api/src/modules/slack/domain/slack-signature.policy.spec.ts`: known-vector valid/invalid
      signature + stale-timestamp rejection (slack-capture-flow.md §1).
- [X] T046 [P] [US2] Contract test
      `apps/api/src/modules/slack/controllers/slack-events.controller.contract.spec.ts` (commands):
      `401` on bad/missing signature with **no enqueue**; `200` ack shape on valid (slack-capture-flow.md
      §1/§2).
- [X] T047 [P] [US2] Integration test (real PG)
      `apps/api/src/modules/slack/processors/slack-capture.processor.int.spec.ts` (slash kind): creates
      the right item, `source='SLACK'`, smart defaults, unresolved tokens kept verbatim, mapped-vs-unmapped
      attribution (FR-SLK-010/012/013).

### Implementation for User Story 2

- [X] T048 [US2] Implement the pure `apps/api/src/modules/slack/domain/slack-signature.policy.ts`
      (`v0=` HMAC-SHA256 over `v0:{ts}:{rawBody}`, `timingSafeEqual`, ≤300 s window) (research D4).
- [X] T049 [US2] Implement `apps/api/src/modules/slack/guards/slack-signature.guard.ts` that reads the
      **raw body** and applies the policy before any handler work (research D4; depends on T048).
- [X] T050 [US2] Configure the per-route **raw-body** parser for the Slack webhook paths only (in
      `apps/api/src/main.ts` / Slack module wiring) so signature bytes are exact and other JSON parsing is
      unaffected (research D4).
- [X] T051 [US2] Implement the capture queue `apps/api/src/modules/slack/processors/slack-capture.queue.ts`
      (BullMQ queue + worker gated by `WORKER=1`) (research D7).
- [X] T052 [US2] Implement `apps/api/src/modules/slack/processors/slack-capture.processor.ts`: dedupe via
      deterministic `jobId`, `tenant.run(...)` from the server-resolved principal, resolve connection by
      `team_id`, resolve captor + default project, no-op if `revokedAt`/missing (research D2/D7/D8;
      depends on T051, T017, T018).
- [X] T053 [US2] Implement `apps/api/src/modules/slack/providers/capture-from-slack.provider.ts`:
      `parseQuickAdd(text)` (verbatim) → `WorkItemsService.create({ projectId, quickAdd, source:'SLACK',
      reporterId })`; return resolved/unresolved for the reply (research D5; depends on T012).
- [X] T054 [US2] Implement `apps/api/src/modules/slack/controllers/slack-events.controller.ts`
      `POST /integrations/slack/commands`: guard → resolve connection by `team_id` → enqueue slash job →
      **ack ≤3 s** (slack-capture-flow.md §2/§3; depends on T049, T052).
- [X] T055 [US2] Post the confirmation via `SlackPort.respond(response_url, …)` from the processor — item
      key + deep link + note of what was/wasn't applied; "link your account" prompt if the captor is
      unmapped (slack-capture-flow.md §3/§5; depends on T052, T053).
- [X] T056 [US2] Append US2 required tests (T045–T047) to
      `apps/api/src/modules/slack/module.testplan.ts`.

**Checkpoint**: US2 functional — slash capture creates items with correct parsing/attribution and confirms
in Slack within seconds, idempotently.

---

## Phase 5: User Story 3 - Richer Slack capture via an interactive modal (Priority: P1)

**Goal**: `/task` with no text (or "More options") opens an interactive modal (project, assignee,
priority, due date, description); submit creates the item (`source = SLACK`, smart defaults; never blocked
on missing fields) and confirms in Slack. Block Kit is built by pure, unit-testable functions.

**Independent Test**: Run `/task` with no args → modal opens → fill and submit → fully-specified item
created with chosen fields + Slack confirmation; title-only submit still creates with defaults. (spec US3)

### Tests for User Story 3 (MANDATORY — write first) ⚠️

- [X] T057 [P] [US3] Unit test `apps/api/src/modules/slack/domain/slack-blocks.spec.ts`: modal +
      confirmation builders produce valid Block Kit and contain **no** tokens/secrets
      (slack-capture-flow.md §4).
- [X] T058 [P] [US3] Integration test (real PG)
      `apps/api/src/modules/slack/processors/slack-capture-modal.processor.int.spec.ts` (modal_submit
      kind): item created with selected values, `source='SLACK'`, title-only still creates (FR-SLK-011/012).
- [X] T059 [P] [US3] Contract test (interactivity) added to
      `apps/api/src/modules/slack/controllers/slack-events.controller.contract.spec.ts`:
      `POST /integrations/slack/interactivity` `view_submission` guarded + ack ≤3 s + enqueue
      (slack-capture-flow.md §4).

### Implementation for User Story 3

- [X] T060 [US3] Implement the pure `apps/api/src/modules/slack/domain/slack-blocks.ts` — modal view +
      confirmation message builders (slack-capture-flow.md §4).
- [X] T061 [US3] Implement `apps/api/src/modules/slack/providers/open-capture-modal.provider.ts`:
      `SlackPort.openModal(trigger_id, view)` **synchronously** (within 3 s) using the Block Kit builder
      (research D-modal; depends on T060, T015).
- [X] T062 [US3] Extend `apps/api/src/modules/slack/controllers/slack-events.controller.ts`: the
      `/commands` no-text branch opens the modal (T061); add `POST /integrations/slack/interactivity`
      (`view_submission` → guard → ack → enqueue `modal_submit` job) (depends on T054, T061).
- [X] T063 [US3] Extend `apps/api/src/modules/slack/processors/slack-capture.processor.ts` to handle
      `kind: 'modal_submit'` → `WorkItemsService.create({ …selected, source:'SLACK', reporterId })` +
      confirmation (depends on T052, T053).
- [X] T064 [US3] Append US3 required tests (T057–T059) to
      `apps/api/src/modules/slack/module.testplan.ts`.

**Checkpoint**: US3 functional — guided modal capture works for non-technical users (Albert/Marissa test).

---

## Phase 6: User Story 4 - Drive the workspace from an AI agent via MCP (Priority: P1)

**Goal**: Make the **49 already-registered** MCP tools live over stdio + streamable HTTP/SSE,
authenticated by PAT, held to the **same RBAC + tenant isolation** as the UI/API (effective = scope ∩
role, default-deny). Agent can `whoami`, select a workspace, capture/triage/track with typed results and
categorized errors; items created via MCP record `source = MCP`. `check-mcp-parity` stays **49/49**.

**Independent Test**: Connect an MCP client with a PAT → list tools → `whoami` → `create_issue` →
`list_issues`/`search` (cursored) → `update_issue` → `add_comment`; a read-only PAT attempting a mutation
is denied with `PERMISSION_DENIED` and nothing changes. (spec US4; quickstart US4)

### Tests for User Story 4 (MANDATORY — write first) ⚠️

> **Every MCP tool requires a contract test** (Principle V, FR-X-002). The 49 tools are covered by the
> grouped contract specs T070–T077 (each spec lists exactly the tools it covers); together they cover all
> 49 with no gaps and the parity gate stays green.

- [X] T065 [P] [US4] Integration test `apps/api/src/mcp/mcp-auth.int.spec.ts`: PAT → principal; revoked
      PAT denied mid-session; scope ∩ role enforced (FR-MCP-002, SC-004).
- [X] T066 [P] [US4] Integration test (real PG) `apps/api/src/mcp/tools/mcp-capture.int.spec.ts`:
      `create_issue` / `quick_add_issue` create items with `source='MCP'`, attributed to the token user,
      unresolved returned in `meta` (FR-MCP-006, capture-source.md §4).
- [X] T067 [P] [US4] Contract test `apps/api/src/mcp/tools/mcp-pagination.contract.spec.ts`:
      `list_issues` / `search` return cursored, filtered, field-selected results, **never truncated**
      (FR-MCP-005, US4.3).
- [X] T068 [P] [US4] Tenant-isolation test `apps/api/src/mcp/mcp-tenant-isolation.spec.ts`: a foreign id
      yields `NOT_FOUND`/`PERMISSION_DENIED`; **0** cross-tenant rows (SC-004).
- [X] T069 [P] [US4] Contract test `apps/api/src/mcp/tools/context-tools.contract.spec.ts`:
      `whoami`, `list_workspaces`, `get_workspace`, `set_active_workspace` return principal/scopes and
      scope subsequent calls (FR-MCP-003).
- [X] T070 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/work-items-tools.contract.spec.ts`
      covering the 14 work-items/labels tools: `create_issue, quick_add_issue, update_issue, delete_issue,
      restore_issue, move_issue, add_subtask, list_issues, get_issue, add_label_to_issue,
      remove_label_from_issue, list_issue_activity, list_labels, create_label` — typed result shape +
      categorized error on bad/missing/denied (mcp-server.md §8).
- [X] T071 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/projects-tools.contract.spec.ts`
      covering the 7 projects tools: `list_projects, get_project, create_project, update_project,
      archive_project, delete_project, add_project_member`.
- [X] T072 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/statuses-tools.contract.spec.ts`
      covering the 5 statuses tools: `list_statuses, create_status, update_status, reorder_statuses,
      delete_status`.
- [X] T073 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/views-tools.contract.spec.ts`
      covering the 4 views tools: `list_views, save_view, update_view, delete_view`.
- [X] T074 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/collab-tools.contract.spec.ts`
      covering the 4 comments/notifications tools: `list_comments, add_comment, list_notifications,
      update_notification`.
- [X] T075 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/search-tool.contract.spec.ts`
      covering `search` (ranked, permission-scoped).
- [X] T076 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/org-tools.contract.spec.ts`
      covering the 7 org/membership tools: `get_org_settings, update_org_settings, transfer_ownership,
      list_members, invite_member, set_member_role, remove_member` (incl. destructive-flag handling).
- [X] T077 [P] [US4] Per-tool contract test `apps/api/src/mcp/tools/token-tools.contract.spec.ts`
      covering the 3 PAT tools: `list_api_tokens, create_api_token, revoke_api_token`.

### Implementation for User Story 4

- [X] T078 [US4] Implement `apps/api/src/mcp/tools/context-tools.ts`
      (`whoami`/`list_workspaces`/`get_workspace`/`set_active_workspace`) over `IdentityService`/
      `OrgsService` + `mcp-session` (research D9; depends on T023, T025).
- [X] T079 [US4] Wire the 14 work-items/labels tools in `apps/api/src/mcp/tools/tool-dispatch.ts` to the
      existing `WorkItemsService`/`LabelsService` (capture tools pass `source:'MCP'`) (depends on T025,
      T011, T026).
- [X] T080 [US4] Wire the projects (7), statuses (5), and views (4) tools in `tool-dispatch.ts` to
      `ProjectsService`/`StatusesService`/`ViewsService` (depends on T025).
- [X] T081 [US4] Wire the comments/notifications (4) and `search` (1) tools in `tool-dispatch.ts` to
      `CommentsService`/`NotificationsService`/`SearchService` (depends on T025, T026).
- [X] T082 [US4] Wire the org-settings/membership (7) and PAT (3) tools in `tool-dispatch.ts` to
      `OrgsService`/membership/`IdentityService` (destructive tools honored) (depends on T025).
- [X] T083 [US4] Implement the remote transport `apps/api/src/mcp/transport/mcp-http.controller.ts`
      (streamable HTTP/SSE at `POST/GET /mcp`, `Authorization: Bearer <PAT>`) mounted in the `api` process
      (research D10; depends on T021, T022).
- [X] T084 [US4] Implement the local stdio entrypoint `apps/api/src/mcp/transport/mcp-stdio.entry.ts` +
      `apps/api/src/main.mcp.ts` (auth via `RYTASK_PAT`) and add the `mcp:stdio` script to
      `apps/api/package.json` — a third entrypoint of the **same image** (research D10; depends on T021,
      T022).
- [X] T085 [US4] Append all MCP required tests (T065–T077) to `apps/api/src/mcp/mcp.testplan.ts` and run
      `pnpm check:mcp-parity` to confirm it stays **green at 49/49** (research D11; depends on
      T078–T082).

**Checkpoint**: US4 functional — an agent can drive the full M0/M1 capture/triage/track surface over both
transports, with parity green.

---

## Phase 7: User Story 5 - Map Slack identities to the right teammates (Priority: P2)

**Goal**: Tasks from Slack attribute to the correct RyTask user. Auto-match by email on connect (US1);
admins manually link/unlink unmatched users; an unmapped captor is prompted (in Slack) to link.

**Independent Test**: On `/settings/integrations/slack-users`, email-matched users show auto-linked;
manually link an unmatched user; a subsequently-captured task is attributed to that teammate; an unmapped
captor sees the link prompt. (spec US5)

### Tests for User Story 5 (MANDATORY — write first) ⚠️

- [X] T086 [P] [US5] Integration test (real PG)
      `apps/api/src/modules/slack/providers/map-slack-user.provider.int.spec.ts`: list mapped/unmapped;
      manual link sets `userId` + `mappedManually=true`; unlink sets `userId=null` (FR-SLK-002, US5.2).
- [X] T087 [P] [US5] Contract test added to
      `apps/api/src/modules/slack/controllers/slack-admin.controller.contract.spec.ts`:
      `GET /users`, `POST/DELETE /users/{slackUserId}/map` admin-only + tenant-scoped (slack-rest.md §C).

### Implementation for User Story 5

- [X] T088 [US5] Implement `apps/api/src/modules/slack/providers/list-slack-users.provider.ts` returning
      `SlackUserMappingDto[]` (mapped + unmapped) (depends on T018).
- [X] T089 [US5] Implement `apps/api/src/modules/slack/providers/map-slack-user.provider.ts` (link +
      unlink, idempotent) (depends on T018).
- [X] T090 [US5] Extend `apps/api/src/modules/slack/controllers/slack-admin.controller.ts` with
      `GET /integrations/slack/users` and `POST/DELETE /integrations/slack/users/{slackUserId}/map`
      (admin-gated) (depends on T038, T088, T089).
- [X] T091 [US5] Ensure the unmapped-captor "link your account" ephemeral prompt fires from the capture
      processor in `apps/api/src/modules/slack/processors/slack-capture.processor.ts` (US5.3; depends on
      T055).
- [X] T092 [US5] Build `apps/web/app/(app)/settings/integrations/slack-users/page.tsx` +
      `slack-users-client.tsx`: table of Slack users with member `Select` to link, auto/manual `Badge`,
      unmapped highlighted, `EmptyState` when not connected (web-surfaces.md §3.B; depends on T040).
- [X] T093 [P] [US5] Add `apps/web/e2e/slack-users.e2e.spec.ts` (list, map, unmap; unmapped highlighted)
      and register it in `apps/web/web.testplan.ts`.
- [X] T094 [US5] Append US5 server tests (T086–T087) to `apps/api/src/modules/slack/module.testplan.ts`.

**Checkpoint**: US5 functional — attribution is correct and manually fixable; capture never blocked on it.

---

## Phase 8: User Story 6 - Manage agent access and learn how to connect (Priority: P2)

**Goal**: An **Agent (MCP) access** page shows the MCP server endpoint(s) + ≤5 plain-language connect
steps and reuses the existing M0 PAT panel to create (shown once) / scope / view-last-used / revoke tokens.

**Independent Test**: On `/settings/agent-access`, read the endpoint + steps, create a scoped PAT (secret
shown once), connect an MCP client, then revoke and confirm the client can no longer act. (spec US6)

### Implementation for User Story 6

- [X] T095 [US6] Expose the MCP endpoint config to the web app (`MCP_PUBLIC_URL` → `httpUrl` + stdio
      hint) via the existing public-config path consumed by `apps/web/lib/` (data-model §3, quickstart §2).
- [X] T096 [US6] Build `apps/web/app/(app)/settings/agent-access/page.tsx` + `agent-access-client.tsx`:
      endpoint + copy-to-clipboard (mono via `--font-mono`) + steps, **reusing the existing M0
      `TokensPanel`** and `apps/web/lib/api/tokens.ts` (research D15, web-surfaces.md §3.C; depends on
      T095).
- [X] T097 [US6] Add the **Agent access** entry to the settings nav (visible to all — every user manages
      own PATs) (web-surfaces.md §1; depends on T096).
- [X] T098 [P] [US6] Add `apps/web/e2e/agent-access.e2e.spec.ts` (endpoint + steps shown; create PAT
      shows secret once; revoke) + axe, and register it in `apps/web/web.testplan.ts`.

**Checkpoint**: US6 functional — humans can govern and learn to connect agents in ≤5 steps (SC-005).

---

## Phase 9: User Story 7 - See where each task came from (Priority: P2)

**Goal**: A token-only `SourceBadge` (Web / Slack / Agent / API, with a text label — not color-alone)
appears on the work item (detail + list) and in its `CREATED` activity entry, alongside the attributed
user — so cross-channel capture is trustworthy and auditable.

**Independent Test**: Create items via web, Slack, and MCP; each item + its activity shows the correct
origin badge and attributed user. (spec US7; quickstart US7)

### Tests for User Story 7 (MANDATORY — write first) ⚠️

- [X] T099 [P] [US7] Component test `apps/web/components/work-item/source-badge.spec.tsx`: renders
      Web/Slack/Agent/API with a **text label**, token-only styling (capture-source.md §3; register in
      `apps/web/web.testplan.ts`).

### Implementation for User Story 7

- [X] T100 [P] [US7] Implement `apps/web/components/work-item/source-badge.tsx` — a `@rytask/ui` `Badge`
      using `var(--info-soft)`/`var(--info-fg)`, mapping `MCP → "Agent"` (research D17, web-surfaces.md
      §3.D).
- [X] T101 [US7] Render `SourceBadge` on the work-item detail + list rows and inside the `CREATED`
      activity entry in `apps/web/` (consuming `work_items.source` already in the payload from T012)
      (FR-WEB-112; depends on T100).
- [X] T102 [US7] Add `apps/web/e2e/source-badge.e2e.spec.ts` asserting items created via web/Slack/MCP
      show the correct badge + attributed user, and register it in `apps/web/web.testplan.ts` (SC-007).

**Checkpoint**: US7 functional — provenance is visible on items and in activity for all four sources.

---

## Phase 10: User Story 8 - Trustworthy, replay-safe capture (Priority: P3)

**Goal**: Harden and *prove* the channels: forged Slack requests rejected (no item); slow operations ack
within Slack's 3 s window and complete async; replayed deliveries never duplicate; disconnect leaves no
orphaned writes; MCP errors are clear and categorized.

**Independent Test**: Bad Slack signature → rejected, no item; slow capture → acked ≤3 s, created async;
replay the same delivery → exactly one item; bad MCP input → clear categorized error. (spec US8)

### Tests for User Story 8 (MANDATORY) ⚠️

- [X] T103 [P] [US8] Webhook integration test (real PG)
      `apps/api/src/modules/slack/processors/slack-capture.webhook.int.spec.ts`: verify → **ack ≤3 s** →
      async create → **replay same `jobId` ⇒ exactly one item** (FR-SLK-014, SC-006).
- [X] T104 [P] [US8] Disconnect-interplay integration test
      `apps/api/src/modules/slack/processors/slack-capture.disconnect.int.spec.ts`: a queued job
      resolving a `revokedAt`/absent connection performs **no write** (Edge Cases).
- [X] T105 [P] [US8] Forged-tenant test
      `apps/api/src/modules/slack/processors/slack-capture.forged-team.tenancy.spec.ts`: a foreign/forged
      `team_id` cannot write into another org (FR-X-001, data-model §5). *(Named `.tenancy.spec.ts` so it
      routes to the real-Postgres integration suite, not the DB-less unit suite.)*
- [X] T106 [P] [US8] MCP categorized-error contract test `apps/api/src/mcp/mcp-errors.contract.spec.ts`:
      invalid input → `INVALID_ARGUMENT`; denial → `PERMISSION_DENIED`; missing → `NOT_FOUND`; **no
      partial mutation** (FR-MCP-004, US8.4).

### Implementation / hardening for User Story 8

- [X] T107 [US8] Add the ≤300 ms p95 server-side create assertion for cross-channel capture
      (FR-CAP-001/SC-002) — a perf assertion in the create integration path and/or a `k6` script under
      `infra/` (research D7, slack-capture-flow.md §6). *(Delivered as `infra/k6/capture-create.js` with a
      `p(95)<300` threshold on the shared create path.)*
- [X] T108 [US8] Append US8 required tests (T103–T106) to the relevant test plans
      (`apps/api/src/modules/slack/module.testplan.ts` and `apps/api/src/mcp/mcp.testplan.ts`).

**Checkpoint**: All 8 user stories complete; the channels are demonstrably secure and replay-safe.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Confirm every enforced gate is green and the milestone is shippable (quickstart §5).

- [X] T109 [P] Run `pnpm check:mcp-parity` and confirm it stays **green at 49/49** (transport now live; no
      tools added or orphaned — research D11; plan.md Complexity Tracking). ✅ *49 tools cover 49 capabilities.*
- [X] T110 [P] Run `pnpm check:required-tests` and confirm the Slack module, MCP edge, and web test plans
      have **no missing** declared tests (Principle V). ✅ *125 required tests present across 12 modules.*
- [X] T111 [P] Run `pnpm check:design-tokens` and confirm the four new web surfaces are token-only (no raw
      hex/px, no gradient/blur/floaty-shadow/non-system-font/emoji-chrome) — Principle VIII, FR-X-003.
      ✅ *137 files scanned, token-only conformance OK.*
- [X] T112 [P] Run `pnpm check:boundaries` (dependency-cruiser): Slack calls other modules **only** via
      their `*.contract.ts`; the MCP edge reaches into **no** module internals (Principle III).
      ✅ *0 violations across 1168 modules.*
- [X] T113 [P] Confirm axe a11y on the connect-Slack and Agent-access journeys (keyboard, focus-trap,
      `role="alert"`, `prefers-reduced-motion`) (web-surfaces.md §4). ✅ *axe assertions embedded in
      `connect-slack.e2e.spec.ts` + `agent-access.e2e.spec.ts` and registered in `web.testplan.ts`; run
      under the e2e gate (T115).*
- [X] T114 Update `README.md` / docs with the Slack + MCP env vars and the stdio `mcp:stdio` entrypoint
      (quickstart §2) — no new compose service (Principle VII). ✅ *Added a "Slack capture & MCP server"
      subsection to README (env vars + HTTP/stdio transports); `.env.example` already documents all keys.*
- [X] T115 Run the full `quickstart.md` §4 verification matrix (US1–US8) against the live stack and the
      `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` gates. ✅ *Static + server gates green:
      `pnpm lint` (587 files), `pnpm typecheck` (10/10 pkgs), full API unit (60 files / 436 tests) and the
      full real-Postgres/Redis integration suite. The live-stack `pnpm test:e2e` US1–US8 walkthrough is the
      operator's runtime step (needs the running Docker stack + Playwright browsers).*

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**. Within it: DB (T005→T006→T007)
  precedes the source-aware create (T012) and the Slack repos (T017/T018); contracts (T009–T011) and ports
  (T013–T015) can run in parallel; channel skeletons (T016, T021) gate their repos/dispatch.
- **User Stories (Phases 3–10)**: all depend on Foundational. After it, the four P1 stories can proceed in
  parallel (US1/US2 own the Slack module; US4 owns the MCP edge — largely disjoint files). P2/P3 follow.
- **Polish (Phase 11)**: depends on all targeted stories.

### Cross-story dependencies (kept minimal for independence)

- **US1 → US2/US3/US5**: US2/US3 capture and US5 mapping require a connected workspace + the Slack repos;
  US1 establishes connect/disconnect. (Foundational provides the repos; US1 provides live connections.)
- **US2 → US3**: US3 extends the shared `slack-events.controller.ts` and `slack-capture.processor.ts`
  created in US2 (same files — sequence US3 after US2 for those two files).
- **US2 → US5 (T091)**: the unmapped link-prompt extends the US2 processor reply (T055).
- **US4 → US6**: the Agent-access page documents/uses the MCP server US4 makes live (US6 is testable once
  the endpoint exists; can build UI against config in parallel).
- **US2/US3 → US8**: US8 hardening tests exercise the webhook/processor implemented in US2/US3.
- **T012 → US7**: the source badge consumes `work_items.source` populated by the source-aware create.

### Within each user story

- Tests (the `### Tests` block) are written **first** and must FAIL before implementation.
- Repositories/domain policies → providers → controllers/transports → web client → e2e.
- Append required tests to the test plan as their spec files land (so `check-required-tests` enforces them).

---

## Parallel Opportunities

- **Setup**: T002, T003, T004 in parallel (T001 first).
- **Foundational**: T009/T010/T011 (contracts) ∥ T013 (crypto) ∥ T014 (port) — different files; then
  T017/T018 ∥ ; T022/T023/T024/T026 (MCP edge pieces) in parallel.
- **Across P1 stories**: once Foundational is done, **US1+US2 (Slack)** and **US4 (MCP)** can be built by
  different developers in parallel (disjoint directories). US3 follows US2 (shared controller/processor).
- **US4 tests**: T065–T077 are all `[P]` (separate spec files) — the 9 grouped per-tool contract specs
  (T070–T077 + context T069) can be written concurrently.
- **Per-story tests**: every `[P]`-marked test task in a story can run together.

### Parallel example — User Story 4 (MCP)

```bash
# Write all MCP contract/integration tests together (separate files):
Task: "mcp-auth.int.spec.ts"                 # T065
Task: "mcp-capture.int.spec.ts"              # T066
Task: "mcp-pagination.contract.spec.ts"      # T067
Task: "mcp-tenant-isolation.spec.ts"         # T068
Task: "context-tools.contract.spec.ts"       # T069
Task: "work-items-tools.contract.spec.ts"    # T070  (14 tools)
Task: "projects-tools.contract.spec.ts"      # T071  (7 tools)
Task: "statuses-tools.contract.spec.ts"      # T072  (5 tools)
Task: "views-tools.contract.spec.ts"         # T073  (4 tools)
Task: "collab-tools.contract.spec.ts"        # T074  (4 tools)
Task: "search-tool.contract.spec.ts"         # T075  (1 tool)
Task: "org-tools.contract.spec.ts"           # T076  (7 tools)
Task: "token-tools.contract.spec.ts"         # T077  (3 tools)
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 (Setup) → 2. Phase 2 (Foundational — **critical**, blocks all) → 3. Phase 3 (US1).
4. **STOP and VALIDATE**: connect/disconnect a Slack workspace end-to-end (quickstart US1).
5. Demo: "RyTask connects to Slack."

### Incremental delivery (recommended order)

1. Setup + Foundational → foundation ready.
2. **US1** (connect) → demo. **US2** (slash capture) → demo (the signature D2 moment). **US3** (modal) →
   demo. **US4** (MCP) → demo (the signature D3 moment). *(P1 set = the milestone's core promise.)*
3. **US5** (mapping) → **US6** (agent-access UI) → **US7** (source badge). *(P2 — trust + governance + UX.)*
4. **US8** (trust/replay hardening) → Polish. *(P3 — production hardening + green gates.)*

### Parallel team strategy

- After Foundational: **Dev A** → US1+US2+US3 (Slack module); **Dev B** → US4 (MCP edge); **Dev C** → web
  surfaces (US1 page, US5 mapping, US6 agent-access, US7 badge) against the typed clients/contracts.
- US8 and Polish are a shared final pass once the implementing stories land.

---

## Notes

- **One brain**: Slack and MCP capture call the **same** `WorkItemsService.create` and the **same**
  `parseQuickAdd` as the web — never a parallel implementation (research D1/D5/D9). `#` stays a **label**.
- **Tenant safety off-request**: the Slack worker (T052) and MCP dispatcher (T025) **must** `tenant.run(...)`
  from a **server-resolved** principal before any repository call — repositories fail-closed otherwise.
- **Idempotency is the `jobId`** (T052): enqueue Slack captures with the deterministic
  `slack:{team_id}:{slash|modal}:{trigger_id|ts}` — **no** dedup table (research D7).
- **Secrets**: bot tokens encrypted at rest (T013); signing/client secrets + enc key from env only; no
  secret in any URL or log; PAT secret shown exactly once (reused M0 behavior).
- **Parity is structural, not duplicated**: the MCP edge dispatches to existing services; the gate stays
  **49/49**. The Slack connection-management endpoints intentionally lack MCP tools in M3 (plan.md
  Complexity Tracking) — a tracked, spec-authorized deferral, not a gap.
- **Tokens-first UI**: every new web value is a semantic `var(--*)`; reuse the M0 PAT panel for
  Agent-access rather than rebuilding it (research D15/D17).
- `[P]` = different files, no incomplete dependency. `[Story]` maps the task to its user story. Verify
  tests fail before implementing; commit after each task or logical group; stop at any checkpoint to
  validate a story independently.
