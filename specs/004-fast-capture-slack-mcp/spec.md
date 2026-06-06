# Feature Specification: Fast Capture Everywhere — Slack & MCP (Milestone M3)

**Feature Branch**: `004-fast-capture-slack-mcp`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "RyTask Milestone M3 frontend and backend"

## Overview

This feature delivers **M3 — "Fast capture everywhere"**: the two new capture-and-control channels that, alongside the web quick-add already shipped in M0+M1, make RyTask's headline promise real — *write down the thing that just interrupted you, from wherever it lands, in seconds* — and let an AI agent drive the workspace.

It is **full-stack** (backend capability **and** web surface) and adds two new channels onto the complete, stable M0 (Identity, Tenancy & Onboarding) and M1 (Core Work Loop) backend:

1. **First-class Slack capture** (differentiator **D2**) — install a Slack app per workspace, then capture a work item in seconds with the `/task` slash command (one-line inline syntax) or a richer interactive modal, attributed to the right teammate, never blocking on missing fields.
2. **The first-party MCP server** (differentiator **D3**) — anything a human can do in the UI for the capabilities shipped so far, an AI agent (e.g. Claude Code) can do via MCP: capture, triage, and track work items, authenticated by a Personal Access Token and held to the **exact same RBAC and tenant isolation** as the UI and API.

Both channels are **clients of the same domain model and permission system** as the web app — one brain everywhere. The web surface for this milestone is the **Integrations / Slack settings** and **Agent (MCP) access** screens, plus **source attribution** ("where did this task come from?") shown on items and in activity.

**Scope frame**: the **MVP `Must` subset** of M3 per `knowledge/BRD.md` §9 and `knowledge/BUILD-PLAYBOOK.md` — Slack `FR-INT-SLACK-001/002/003/007/013` and MCP `FR-INT-MCP-001…004/007` for the capabilities that already exist (M0/M1). Two-way Slack sync, message-action / @mention capture, smart Slack notifications, time control from Slack/MCP, MCP resources/prompts, and the formal MCP 100%-parity CI gate are **later-milestone / v2** and are listed in **Out of Scope**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a Slack workspace to RyTask (Priority: P1)

As an admin, I install/connect the RyTask Slack app to my Slack workspace so my team can capture work from Slack. I authorize via Slack's standard consent flow, and afterwards RyTask shows the workspace as **connected** and maps that Slack workspace to our RyTask workspace.

**Why this priority**: Nothing else in the Slack half of M3 works until a workspace is connected. It is the enabling slice and is independently demonstrable.

**Independent Test**: From the Integrations settings page, start the connect flow, complete Slack consent, and return to RyTask showing a "Connected" status bound to the correct RyTask workspace — verifiable end-to-end without any capture happening yet.

**Acceptance Scenarios**:

1. **Given** I am an admin on the Integrations page, **When** I click "Connect Slack" and approve the Slack consent screen, **Then** I am returned to RyTask, the Slack workspace is linked to my RyTask workspace, and the page shows "Connected" with the Slack workspace name.
2. **Given** a non-admin user, **When** they open Integrations, **Then** they can see connection status but cannot start, change, or remove the connection.
3. **Given** a workspace already connected, **When** an admin chooses "Disconnect", **Then** the connection is removed, stored Slack credentials are revoked, and Slack capture stops working until reconnected.

---

### User Story 2 - Capture a task from Slack in seconds (Priority: P1)

As an interrupted teammate, when a Slack message derails me I type `/task Fix login bug !urgent @ali #bugs ^Friday` and RyTask instantly creates the work item — parsing the inline syntax into priority, assignee, project, and due date — then replies to me in Slack with the item's key and a link. I never leave Slack and never fill a form.

**Why this priority**: This is the signature D2 capability and the fastest path in the whole product. It is the reason Slack is in the milestone.

**Independent Test**: In a connected workspace, run `/task …` with inline tokens and confirm a correctly-populated item is created and a confirmation with the item key + deep link is returned in Slack, in seconds.

**Acceptance Scenarios**:

1. **Given** a connected workspace and a mapped user, **When** I run `/task Fix login bug !urgent @ali #bugs ^Friday`, **Then** an item is created with title "Fix login bug", priority Urgent, assignee Ali, project Bugs, due Friday, **source = Slack**, reporter = me, and Slack replies with the item key and a link.
2. **Given** I run `/task Just the title`, **When** it is submitted, **Then** an item is created with only the title and smart defaults (first workflow status, priority None) — capture is never blocked on missing fields.
3. **Given** an inline hint that cannot be parsed (e.g. an unknown `@name`), **When** the item is created, **Then** the unparseable text remains verbatim in the title (never silently dropped) and the reply notes what was and wasn't applied.

---

### User Story 3 - Richer Slack capture via an interactive modal (Priority: P1)

As a non-technical teammate who doesn't want to learn inline syntax, I run `/task` with no text (or choose "More options"), and RyTask opens an interactive modal where I pick project, assignee, priority, and due date and type a description. Submitting creates the item.

**Why this priority**: Passes the Albert/Marissa test — non-technical users live in Slack and must be able to capture richly without memorizing tokens. Pairs with US2 to cover both fast and guided capture.

**Independent Test**: Run `/task` with no arguments, complete the modal, submit, and confirm a fully-specified item is created with the chosen fields and a Slack confirmation.

**Acceptance Scenarios**:

1. **Given** a connected workspace, **When** I run `/task` with no text, **Then** a modal opens with fields for project, assignee, priority, due date, and description.
2. **Given** the modal is open, **When** I submit it, **Then** an item is created with the selected values, source = Slack, and Slack confirms with the item key + link.
3. **Given** the modal, **When** I submit with only a title, **Then** the item is still created with smart defaults (capture is never blocked).

---

### User Story 4 - Drive the workspace from an AI agent via MCP (Priority: P1)

As a developer working inside Claude Code, I connect the RyTask MCP server using a Personal Access Token, list the available tools, and then **capture, triage, and track** work — create an item, search and read items, change status/priority/assignee, add labels and sub-tasks, and comment — all in one place, getting structured, typed results back, with everything attributed to me and scoped to my permissions.

**Why this priority**: This is the signature D3 capability — 100% control parity for the agent over the capabilities shipped so far — and a primary persona's daily driver.

**Independent Test**: Connect an MCP client with a PAT, list tools, then create → find → update → comment on an item entirely through MCP, confirming the same outcomes a UI user would get and structured results throughout.

**Acceptance Scenarios**:

1. **Given** a valid PAT, **When** an MCP client connects and lists tools, **Then** it receives the M3 capture/triage/track tool set and can call `whoami` to see its principal, scopes, and accessible workspaces.
2. **Given** a selected workspace context, **When** the agent calls `create_issue` with a title and fields, **Then** an item is created (source = MCP, attributed to the token's user) and the agent receives a typed result with the item's key.
3. **Given** the agent calls a list/search tool, **When** it passes filter/page/limit, **Then** it receives paged, filtered, typed results with a cursor (within a token budget).
4. **Given** a read-only-scoped token, **When** the agent attempts a mutation, **Then** the call is denied with a structured permission error and nothing changes.

---

### User Story 5 - Map Slack identities to the right teammates (Priority: P2)

As an admin, I make sure tasks captured in Slack are attributed to the correct RyTask user. RyTask auto-matches Slack users to teammates by email, and for anyone unmatched I can link them manually; an unmatched person capturing from Slack is prompted to link their account.

**Why this priority**: Correct attribution is what makes Slack capture trustworthy, but basic capture (US2/US3) can be demoed before mapping is perfected — hence P2.

**Independent Test**: View the Slack user list in settings, confirm email-matched users are linked automatically, manually link an unmatched user, and confirm a subsequently-captured task is attributed to that teammate.

**Acceptance Scenarios**:

1. **Given** Slack users whose emails match RyTask users, **When** the workspace connects, **Then** those users are auto-mapped and tasks they capture are attributed to them.
2. **Given** an unmatched Slack user, **When** an admin opens the mapping screen, **Then** they can link that Slack user to a RyTask teammate.
3. **Given** an unmatched Slack user runs `/task`, **When** the command is processed, **Then** the item is still captured and the user is prompted (in Slack) to link their account for correct attribution.

---

### User Story 6 - Manage agent access and learn how to connect (Priority: P2)

As an admin/developer, I open the **Agent (MCP) access** page to create and scope Personal Access Tokens for agents, revoke them, see when each was last used, and read clear instructions (server endpoint + steps) for connecting an MCP client like Claude Code.

**Why this priority**: Makes the MCP channel usable and governable by humans; depends on the server (US4) existing but isn't required to prove the server works.

**Independent Test**: Create a scoped token on the Agent access page, copy the connection details, connect an MCP client successfully, then revoke the token and confirm the client can no longer act.

**Acceptance Scenarios**:

1. **Given** the Agent access page, **When** I create a token with a chosen scope, **Then** the token is shown once, listed with its scope, and usable to authenticate an MCP client.
2. **Given** a listed token, **When** I revoke it, **Then** it can no longer authenticate MCP or API calls, and the list reflects the change.
3. **Given** the page, **When** I read it, **Then** I see the MCP server endpoint(s) and concrete steps to connect an agent, written plainly.

---

### User Story 7 - See where each task came from (Priority: P2)

As any user, I can tell at a glance whether a task was captured from the web, from Slack, or by an agent, both on the item itself and in its activity history — so the team can trust and audit cross-channel capture.

**Why this priority**: Source attribution turns multi-channel capture into something trustworthy and reportable; valuable but not required to capture.

**Independent Test**: Create items via web, Slack, and MCP, then confirm each item and its activity entry shows the correct origin badge (Web / Slack / Agent) and the attributed user.

**Acceptance Scenarios**:

1. **Given** items captured from different channels, **When** I view an item, **Then** its origin (Web / Slack / Agent / API) is shown.
2. **Given** an item captured from Slack or by an agent, **When** I open its activity, **Then** the creation entry records the source and the attributed user.

---

### User Story 8 - Trustworthy, replay-safe capture (Priority: P3)

As a self-hoster, I need the Slack and agent channels to be secure and reliable: forged Slack requests are rejected, slow operations still acknowledge Slack within its 3-second window, retried Slack deliveries don't create duplicates, and agent errors are clear rather than cryptic.

**Why this priority**: Essential for production trust, but the happy-path capture stories can be demonstrated first; this hardens them.

**Independent Test**: Send a request with an invalid Slack signature (rejected); trigger a slow capture and confirm Slack is acknowledged immediately while work completes asynchronously; replay the same Slack delivery and confirm only one item is created.

**Acceptance Scenarios**:

1. **Given** an incoming Slack request, **When** its signature is missing or invalid, **Then** it is rejected and no item is created.
2. **Given** a `/task` that takes longer than Slack's ack window to fully process, **When** it is received, **Then** Slack is acknowledged immediately and the item is created via background processing, with a follow-up confirmation.
3. **Given** the same Slack command delivered twice (a retry), **When** both are processed, **Then** exactly one item is created (idempotent).
4. **Given** an MCP call with invalid input or for a missing item, **When** it runs, **Then** the agent receives a clear, structured error (validation / permission / not-found) and no partial change occurs.

---

### Edge Cases

- **Capture into an inaccessible workspace/project** (Slack channel mapped to a project the user can't access): route to a safe default and warn, never lose the capture.
- **Duplicate-looking capture** from Slack or MCP: the item is still created; surfacing a "relate?" hint is a later enhancement, not a blocker.
- **Slack workspace connected, but a captured user has no RyTask account**: capture succeeds, attribution falls back, the user is prompted to link (US5).
- **PAT revoked mid-session**: in-flight and subsequent MCP calls are denied cleanly; the client receives an auth error.
- **PAT or token scope narrower than the user's role**: effective permission is the intersection — a read-only token cannot write even if the user could.
- **Agent requests more than a token budget allows** on a list/search: results are paged with a cursor rather than truncated silently.
- **Slack consent declined or interrupted** mid-OAuth: no partial connection is recorded; the settings page still shows "Not connected".
- **Disconnect while jobs are queued**: queued Slack jobs stop affecting the workspace; no orphaned writes after disconnect.
- **Unparseable or partially-parseable quick-add tokens**: the raw text stays in the title; nothing is silently dropped.

## Requirements *(mandatory)*

Requirements reuse the canonical backend IDs (`FR-INT-SLACK-*`, `FR-INT-MCP-*`, `FR-WI-004`) as their authority and add an M3-scoped web family (`FR-WEB-*`) for the new UI surfaces, each traced in **Traceability**. All items are MVP-stage `Must` unless noted. The server is the sole authority; client role-gating is cosmetic.

### Slack — connection & identity

- **FR-SLK-001**: The system MUST let an admin install/connect a Slack app per workspace via the standard Slack consent flow, mapping the Slack workspace to a RyTask workspace. *(FR-INT-SLACK-001)*
- **FR-SLK-002**: The system MUST map Slack users to RyTask users automatically by email and allow manual linking of unmatched users; captures attribute to the mapped user. *(FR-INT-SLACK-007)*
- **FR-SLK-003**: The system MUST let an admin disconnect a Slack workspace, after which stored Slack credentials are revoked and Slack capture stops; reconnecting is possible.
- **FR-SLK-004**: Slack connection management (connect, map users, disconnect) MUST be restricted to admins; all others may view status only.

### Slack — capture

- **FR-SLK-010**: The system MUST provide a `/task` slash command that creates a work item from a single line, parsing inline syntax (assignee `@`, label/project `#`, priority `!`, due `^`, estimate `~`) using the **existing M1 quick-add grammar**, and reply in Slack with the item key and a deep link. *(FR-INT-SLACK-002, FR-WI-004)*
- **FR-SLK-011**: The `/task` command with no arguments (or an explicit "More options") MUST open an interactive modal for richer capture — project, assignee, priority, due date, and description — that creates the item on submit. *(FR-INT-SLACK-003)*
- **FR-SLK-012**: Slack capture MUST never block on missing fields: title-only is valid; smart defaults apply (first workflow status, priority None, reporter = the captor); unparseable hints remain in the title verbatim. *(FR-WI-004)*
- **FR-SLK-013**: Every item captured from Slack MUST record **source = Slack** and the attributed user. *(PRD F-CAP-1; source vocabulary FR-TT-004)*
- **FR-SLK-014**: The Slack channel MUST verify request signatures, acknowledge within Slack's 3-second window, process slow work asynchronously via a queue, and be idempotent on Slack retries (no duplicate items). *(FR-INT-SLACK-013)*

### MCP — server, auth & context

- **FR-MCP-001**: The system MUST ship a first-party MCP server exposing tools over both local (stdio) and remote (streamable HTTP/SSE) transports; an MCP client can connect, list tools, and invoke them. *(FR-INT-MCP-001)*
- **FR-MCP-002**: MCP access MUST authenticate via Personal Access Token / API key and enforce the **same RBAC and tenant isolation** as the UI/API (default-deny; cross-tenant access impossible; effective permission = intersection of token scope and user role). *(FR-INT-MCP-002, FR-RBAC-009)*
- **FR-MCP-003**: MCP MUST expose context selection — `whoami`, list/get workspaces, and set the active workspace — so an agent operates within the correct scope and subsequent calls default to it. *(FR-INT-MCP-003)*
- **FR-MCP-004**: Every MCP tool MUST return structured, typed results and clear, categorized errors (validation, permission, not-found). *(FR-INT-MCP-004)*
- **FR-MCP-005**: MCP list/search tools MUST support pagination, filtering, and field selection to stay within token budgets, returning a cursor. *(FR-INT-MCP-007)*
- **FR-MCP-006**: The MCP tool surface for M3 MUST cover **capture, triage, and track** for the capabilities already shipped in M0/M1 — at minimum: create / list / search / get / update issues; targeted setters for status, priority, assignee, labels, and dates; sub-task add/list; comment add/list; project list/get; and global search. Items created via MCP MUST record **source = MCP** and the acting principal. *(FR-INT-MCP tool surface, MVP tier; attribution per PRD §5.3)*

### Fast capture — cross-channel (in scope for M3)

- **FR-CAP-001**: Task creation via any channel (web, Slack, MCP) MUST complete server-side within ≤300 ms p95 and confirm to the user near-instantly. *(NFR-PERF-003)*
- **FR-CAP-002**: Every work item MUST record its **capture source** (web / slack / mcp / api) and the attributed user, surfaced in the UI and activity. *(PRD F-CAP-1; FR-TT-004 source vocabulary)*

### Frontend — Slack settings UI

- **FR-WEB-101**: The web app MUST provide an **Integrations / Slack** settings surface that shows connection status and lets an admin start the connect flow and complete it. *(surfaces FR-INT-SLACK-001)*
- **FR-WEB-102**: The web app MUST provide a **Slack user-mapping** UI that lists mapped/unmapped Slack users and lets an admin link unmatched users to teammates. *(surfaces FR-INT-SLACK-007)*
- **FR-WEB-103**: The web app MUST let an admin **disconnect** Slack from settings, with a clear confirmation of the consequence. *(surfaces FR-SLK-003)*

### Frontend — Agent (MCP) access UI

- **FR-WEB-110**: The web app MUST provide an **Agent (MCP) access** surface that shows the MCP server endpoint(s) and plain-language steps to connect an MCP client (e.g. Claude Code). *(surfaces FR-INT-MCP-001/003)*
- **FR-WEB-111**: The web app MUST let users create, scope, view (last-used), and revoke **Personal Access Tokens** for agents, building on the existing M0 token management. *(surfaces FR-AUTH-007, FR-INT-MCP-002)*
- **FR-WEB-112**: The web app MUST display the **capture source** (Web / Slack / Agent / API) on work items and in their activity feed. *(surfaces FR-CAP-002)*

### Cross-cutting constraints (in scope for M3)

- **FR-X-001**: All new Slack and MCP write paths MUST be multi-tenant by construction (org/workspace-scoped, default-deny) and enforce RBAC server-side identically to the UI/API. *(NFR-SEC-003, NFR-MT-002)*
- **FR-X-002**: New capability MUST be delivered under the project's closed-testing policy: every backend provider has ≥1 integration test (real Postgres), every route a contract test, every MCP tool a contract test, the Slack webhook path an integration test (verify → ack → async process → idempotent on replay), and a tenant-isolation test proving no cross-tenant leakage via Slack or MCP. *(FR-TEST-001…007, FR-TEST-010)*
- **FR-X-003**: All new web UI MUST conform to the brand/design system (Principle VIII): tokens flow `branding/colors_and_type.css → packages/ui → apps/web`, referenced only as semantic `var(--*)`; pass the token-conformance and web-closed-testing gates. *(NFR-WEB-001, NFR-WEB-006)*

## Key Entities *(include if feature involves data)*

- **Slack Workspace Connection**: links one Slack workspace (team) to one RyTask workspace; holds install/authorization metadata and the credentials needed to receive commands and reply. Owned by the tenant; removable on disconnect.
- **Slack User Mapping**: associates a Slack user with a RyTask user for attribution; may be auto-created (email match) or manually linked; an unmapped Slack user can still capture (with a prompt to link).
- **Personal Access Token (existing, M0)**: the credential that authenticates an agent/MCP client; carries scopes; revocable; records last-used. **Reused, not new.**
- **MCP Session Context**: the per-principal active-workspace selection an agent operates within (transient/selectable), so tools default to the right scope.
- **Capture Source (work-item provenance)**: the origin of a created work item — web / slack / mcp / api — plus the attributed user; surfaced on the item and in activity.
- **Web surfaces (client-side concepts)**: the *Integrations / Slack settings* screen, the *Slack user-mapping* screen, the *Agent (MCP) access* screen, and the *source badge* on items/activity. These are presentation over server-owned data; they introduce no new persisted server entities beyond the connection/mapping above.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A connected-workspace teammate can capture a task from Slack in **≤5 seconds**, without leaving Slack and without filling a form (median, slash-command path).
- **SC-002**: Task creation from **any** channel (web, Slack, agent) completes server-side in **≤300 ms p95** and confirms to the user near-instantly.
- **SC-003**: An AI agent can perform **every** capture/triage/track action a UI user can for the capabilities shipped in M0/M1 — a capability→tool coverage check shows **no gaps** for those shipped mutations.
- **SC-004**: **100%** of cross-tenant access attempts via the Slack or agent channel are denied — zero cross-tenant data leakage, asserted by automated tests.
- **SC-005**: A non-technical teammate can connect Slack, and a developer can connect an agent, **each in ≤5 steps** and without reading external documentation (Albert/Marissa test).
- **SC-006**: **100%** of forged/invalid Slack requests are rejected, and **100%** of legitimate slow Slack operations acknowledge within Slack's 3-second window (no user-visible timeouts); replayed deliveries never duplicate items.
- **SC-007**: **100%** of items created via Slack or an agent display the correct **source** and **attributed user** on the item and in its activity history.

## Assumptions

- **M3 scope follows `knowledge/BRD.md` §9 and `knowledge/BUILD-PLAYBOOK.md`**: the MVP `Must` subset — Slack `/task` (slash + modal) capture and the first-party MCP server (capture/triage/track) — plus the web settings/connection surfaces and source attribution. The web **quick-add inline-syntax** capture already shipped in 003; M3 adds the **Slack** and **agent** channels and the settings UIs.
- **"Track" means work-item tracking** (status / assignee / triage / update), **not time tracking**. **M2 (time tracking) is not built and is not a dependency of M3.** Time control from Slack/MCP (FR-INT-SLACK-010, FR-TT-010) and the time-tracking MCP tools are **v2 / out of scope**.
- **M3 builds on complete, stable M0 and M1.** It reuses the existing **Personal Access Tokens / `whoami` / RBAC** (M0), the existing **quick-add parser** and the **work-item / project / status / label / comment / sub-task / search** capabilities (M1), and the existing **Slack port seam** (`apps/api/src/common/ports/slack.port.ts`). It must not break M1's contracts (`users.organizationId`, `project_members`, `TenantScopedRepository`).
- **The MCP tool surface for M3 = the MVP-tier tools whose underlying capability already exists** in M0/M1. Tools for not-yet-built capabilities (time, cycles, milestones, custom fields, automations, reports, dashboards, webhooks/integration-admin) are deferred to the milestone that ships them.
- **Where source docs disagree on tier** (features.md tags Slack two-way sync as MVP; REQUIREMENTS/BRD/BUILD-PLAYBOOK tag `FR-INT-SLACK-006` as Should/v2), M3 follows the **milestone map** (BRD §9 / BUILD-PLAYBOOK): two-way sync is **v2 / out of scope**.
- **MCP source attribution** (FR-INT-MCP-008) and **Slack/MCP idempotent-events parity** (FR-INT-MCP-005) are tagged v2; M3 includes the *minimal* source-recording needed for SC-007 and the Slack-retry idempotency required by FR-SLK-014, and defers the broader audit/event-parity work.
- **Brand fidelity (Principle VIII)** governs all new web UI; tokens are referenced only as semantic `var(--*)` and never copy-pasted.
- Standard operational defaults apply where unspecified: friendly error messages with safe fallbacks; capture is never blocked on missing fields; the server remains the sole authority and client role-gating is cosmetic.

## Out of Scope (deferred to later milestones)

- **Slack — message-action / @mention capture**: "Create task from message" (FR-INT-SLACK-004, v2) and bot @mention natural-language capture/comment (FR-INT-SLACK-005, v2).
- **Slack — two-way sync**: in-app changes posting to the Slack thread and thread replies becoming comments (FR-INT-SLACK-006, v2).
- **Slack — notifications & interactivity beyond capture**: smart notifications and channel routing (FR-INT-SLACK-008), interactive buttons on notifications (FR-INT-SLACK-009), time tracking from Slack (FR-INT-SLACK-010), Slack queries `/mywork` `/standup` (FR-INT-SLACK-011), per-channel default project/labels (FR-INT-SLACK-012), rate-limit/token-rotation hardening (FR-INT-SLACK-014), and the full uninstall lifecycle beyond basic disconnect (FR-INT-SLACK-015).
- **MCP — beyond the M3 capture/triage/track set**: MCP resources & prompts (FR-INT-MCP-006, v2), idempotent-and-event-parity write semantics (FR-INT-MCP-005, v2), dry-run/confirm for destructive ops (FR-INT-MCP-010), full MCP-action audit attribution (FR-INT-MCP-008, v2), and the formal **100%-parity CI gate** (FR-INT-MCP-009 / FR-INT-MCP-011, v2) — M3 ships the tools and their contract tests, not the milestone-wide parity gate.
- **MCP tools for unbuilt capabilities**: time tracking, cycles/milestones, custom fields, automations, reports/dashboards, webhooks, and integration-admin tools — they ship with their owning milestones.
- **Other capture channels**: email-to-task (noted in PRD as v2; no current FR) and GitHub linking (M5).
- **Reporting on capture/interruption** (M4) and **time-tracking** (M2) remain in their own milestones.

## Traceability

| M3 requirement | User story | Canonical source requirement |
|---|---|---|
| FR-SLK-001 (connect per workspace) | US1 | FR-INT-SLACK-001 |
| FR-SLK-002 (Slack↔user mapping) | US5 | FR-INT-SLACK-007 |
| FR-SLK-003 / FR-SLK-004 (disconnect / admin-gated) | US1 | FR-INT-SLACK-001 (lifecycle), FR-RBAC-* |
| FR-SLK-010 (`/task` slash capture) | US2 | FR-INT-SLACK-002, FR-WI-004 |
| FR-SLK-011 (interactive modal) | US3 | FR-INT-SLACK-003 |
| FR-SLK-012 (never block; defaults) | US2, US3 | FR-WI-004 |
| FR-SLK-013 (source = Slack, attribution) | US7 | PRD F-CAP-1; FR-TT-004 (source vocab) |
| FR-SLK-014 (signature, 3s ack, async, idempotent) | US8 | FR-INT-SLACK-013 |
| FR-MCP-001 (server; stdio + HTTP/SSE) | US4 | FR-INT-MCP-001 |
| FR-MCP-002 (PAT auth; RBAC + tenant isolation) | US4, US8 | FR-INT-MCP-002, FR-RBAC-009 |
| FR-MCP-003 (context selection) | US4 | FR-INT-MCP-003 |
| FR-MCP-004 (typed results + errors) | US4, US8 | FR-INT-MCP-004 |
| FR-MCP-005 (pagination/filter/fields) | US4 | FR-INT-MCP-007 |
| FR-MCP-006 (capture/triage/track tool set; source = MCP) | US4, US7 | FR-INT-MCP tool surface (MVP); PRD §5.3 |
| FR-CAP-001 (≤300 ms p95 capture) | US2, US4 | NFR-PERF-003 |
| FR-CAP-002 (capture source recorded) | US7 | PRD F-CAP-1; FR-TT-004 |
| FR-WEB-101 (Slack settings/connect UI) | US1 | FR-INT-SLACK-001 |
| FR-WEB-102 (Slack user-mapping UI) | US5 | FR-INT-SLACK-007 |
| FR-WEB-103 (disconnect UI) | US1 | FR-INT-SLACK-001 |
| FR-WEB-110 (Agent/MCP access page) | US6 | FR-INT-MCP-001/003 |
| FR-WEB-111 (PAT management for agents) | US6 | FR-AUTH-007, FR-INT-MCP-002 |
| FR-WEB-112 (source badge in UI) | US7 | FR-CAP-002 |
| FR-X-001 (tenant/RBAC by construction) | US4, US8 | NFR-SEC-003, NFR-MT-002 |
| FR-X-002 (closed testing; MCP/Slack tests) | all | FR-TEST-001…007, FR-TEST-010 |
| FR-X-003 (brand/design-system fidelity) | US1, US6, US7 | NFR-WEB-001, NFR-WEB-006 |
