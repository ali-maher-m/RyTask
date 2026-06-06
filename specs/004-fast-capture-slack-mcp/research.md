# Research: Fast Capture Everywhere — Slack & MCP (Milestone M3)

**Feature**: `004-fast-capture-slack-mcp` | **Date**: 2026-06-06 | **Phase**: 0 (Outline & Research)

M3 adds two new **channels** onto a complete, stable M0/M1 backend and the 003 web app. The spec's
Assumptions section already resolved the scope/tier disagreements (two-way sync, time control, the
formal milestone-wide parity gate → v2), so there are **no open `NEEDS CLARIFICATION` items**. This
document records the *approach* decisions (D1–D17) — how each channel binds to the existing seams — and
ends with a parity-scope note and the new dependency list.

## Baseline audit (what already exists)

| Area | What exists today | Fidelity for M3 |
|---|---|---|
| Quick-add parser | `apps/api/src/modules/work-items/domain/quick-add.parser.ts` — pure `parseQuickAdd(input, { referenceDate })` → `{ title, assignees[], labels[], priority?, dueDate?, unresolved[] }` | **Reuse verbatim** (D5) |
| Work-item creation | `CreateWorkItemProvider` / `WorkItemsService` — key minting, labels, watchers, `CREATED` activity; sets `reporterId` from tenant context | **Reuse**; add `source` (D6) |
| PAT / `whoami` / RBAC | `identity` module — `api_tokens` (`token_type` ∈ {PAT,OAUTH,MCP}), scoped, `whoami` returns user/org/role/scopes/workspaces; `RbacGuard` + `patHasPermission(role, scopes, perm)` = scope ∩ role; default-deny | **Reuse** for MCP auth (D9) |
| Tenancy | `TenantScopedRepository` (`orgScope`/`scoped`) + `TenantContextService` (ALS) + `TenantContextMiddleware` wrapping the request in `tenant.run(ctx)` | **Reuse**; workers/edge call `tenant.run` (D2) |
| MCP registry | `packages/contracts/src/mcp/registry.ts` — **49 tools** at exact 1:1 parity; `check-mcp-parity.ts` green; **transport deferred (C1)** | Build transport (D9–D14) |
| Slack seam | `apps/api/src/common/ports/slack.port.ts` — `SlackPort.postMessage` + `noopSlack` only (bare stub) | **Extend** + real adapter (D3/D4) |
| Queue/idempotency | BullMQ `Worker` gated by `WORKER=1`; idempotency via deterministic keys / `onConflictDoNothing` | **Reuse** for Slack capture (D7) |
| Web shell | 003 settings shell (`page.tsx` + `*-client.tsx`), `lib/api/*`, capability map `can()`, `@rytask/ui`, token-only styling, `web.testplan.ts`, `check-design-tokens.ts` | **Reuse** for 4 surfaces (D15–D17) |

## Decisions

### D1 — Slack is a new bounded module; MCP is a transport edge

**Decision**: Implement **Slack** as a new bounded context `apps/api/src/modules/slack/` (it owns its
tables, domain, repositories, a public `slack.contract.ts`, and domain events). Implement **MCP** as a
transport **edge** at `apps/api/src/mcp/` that owns **no** domain — it authenticates a principal,
establishes tenant context, and dispatches to the *existing* services, exactly like the REST
controllers do.

**Rationale**: Slack genuinely owns new state (connections, user maps) and new domain rules (signature
verification, capture routing) → it earns a module. MCP owns nothing new — making it a domain module
would duplicate logic and invite drift from the API. Treating MCP as an edge (a sibling of the
controller layer) is what makes Principle IV (API↔MCP parity) **structural**: the same service is the
single implementation behind both REST and MCP. `dependency-cruiser` already forbids cross-module
internals, so Slack must call `WorkItemsService` via its contract, never its repository.

**Alternatives considered**: (a) Put Slack capture logic inside the work-items module — rejected:
couples an integration concern into the core loop and muddies boundaries. (b) Make MCP a domain module
with its own services — rejected: duplicates the API surface and breaks the single-implementation
parity guarantee. (c) Run MCP as a *separate process that calls the REST API over HTTP* — rejected for
M3: adds a network hop, a second auth path, and operational surface; in-process service calls under a
PAT-derived principal honor the same contract with less latency (still not a back door — it goes through
the public service contracts and the same RBAC guard logic).

### D2 — Workers and the MCP edge re-establish `TenantContext` explicitly

**Decision**: Every code path that runs outside the HTTP request middleware (the BullMQ Slack-capture
processor and the MCP tool dispatcher) wraps its service calls in
`tenant.run({ organizationId, workspaceId, userId, role }, () => service.call(...))` before touching any
repository.

**Rationale**: `TenantScopedRepository` reads the org id from AsyncLocalStorage; without an established
context, a repository call would throw (fail-closed) — which is the safe behavior. Re-establishing the
context from a **server-resolved** principal (never client input) preserves Principle II end-to-end and
mirrors the existing `NotificationsDispatchProcessor`, which already does `tenant.run` in the worker.

**Alternatives considered**: (a) Pass `orgId` as an explicit argument through services — rejected:
fights the established ALS pattern and risks an unscoped call site. (b) A second "system" repository
base that bypasses scoping — rejected: violates "raw, unscoped access is forbidden."

### D3 — Extend `SlackPort`; implement a real adapter behind it

**Decision**: Extend the existing `SlackPort` interface to the operations M3 needs —
`postMessage`/`respond(responseUrl, …)`, `openModal(triggerId, view)`, `exchangeOAuthCode(code)`,
`listWorkspaceUsers()`/`lookupUserByEmail` — and add a real adapter
`common/adapters/slack/slack.adapter.ts` (wrapping `@slack/web-api` + `@slack/oauth`). Wire the real
adapter when Slack env is configured; fall back to `noopSlack` otherwise.

**Rationale**: Honors Principle III (external I/O behind a port). Keeping `noopSlack` as the default
means `docker compose up` works with zero Slack config (Principle VII) — Slack features are simply
inert until env is supplied. The provider/worker code depends only on the port, so it stays unit-testable
without hitting Slack.

**Alternatives considered**: (a) Adopt `@slack/bolt` for the whole surface — rejected: Bolt wants to own
its own HTTP listener and routing, which conflicts with NestJS controllers and our signature/ack control
(D4). We use the thin `@slack/web-api` client + `@slack/oauth` `InstallProvider` and keep routing in
Nest. (b) Hand-roll the Web API over `fetch` — rejected: `@slack/web-api` is small, typed, and handles
retries/rate-limit headers.

### D4 — Verify signatures from primitives in a Nest guard; never trust the body first

**Decision**: A `SlackSignatureGuard` (backed by the pure `slack-signature.policy.ts`) verifies
`X-Slack-Signature` = `v0=` HMAC-SHA256 over `v0:{timestamp}:{rawBody}` using the app **signing secret**
(env), and rejects requests whose timestamp is outside a 5-minute window (replay defense), **before**
the controller does any work. The Slack controller must read the **raw body** (configure a raw-body
parser for the Slack routes) because the signature is over exact bytes.

**Rationale**: FR-SLK-014 / SC-006 require 100% rejection of forged requests. Doing it in a guard keeps
it declarative and testable, and the timestamp window blocks replay independent of the idempotency layer
(D7). Raw-body access is the one Nest-config subtlety and must be set per-route so JSON parsing elsewhere
is unaffected.

**Alternatives considered**: (a) Verify inside each handler — rejected: duplicated, easy to forget on a
new route (default-deny is better as a guard). (b) Trust Slack's TLS only — rejected: signatures are the
spec'd integrity control.

### D5 — Slack & MCP capture reuse the M1 quick-add parser **verbatim**

**Decision**: Both the Slack `/task` slash path and the MCP `quick_add_issue` tool call the same
`parseQuickAdd(...)` and the same `WorkItemsService.create(...)`. The `#` token remains a **label**
(M1 grammar unchanged); unresolved tokens stay verbatim in the title and are reported back (Slack reply
notes "what was/wasn't applied"; MCP returns them in `meta.unresolved`).

**Rationale**: FR-SLK-010 mandates the *existing* grammar; one parser = one behavior across all three
channels (web/Slack/MCP) and zero grammar drift (D-consistency with 003's quick-add contract). Never
dropping unparseable text satisfies FR-SLK-012 / US2 scenario 3.

**Alternatives considered**: (a) A Slack-specific grammar where `#` means project — rejected:
contradicts FR-SLK-010 ("existing M1 quick-add grammar") and per-channel default project/labels is
explicitly v2 (FR-INT-SLACK-012). Project selection comes from the connection default or the modal
(D8), not from `#`.

### D6 — Record capture source as a `work_items.source` column (+ activity)

**Decision**: Add `captureSourceEnum` = `['WEB','SLACK','MCP','API']` and a `work_items.source` column
(`NOT NULL`, default `'WEB'`). `WorkItemsService.create` accepts an optional `source` (defaults `WEB`
for the existing REST UI path; `API` for non-UI REST/PAT; `SLACK`/`MCP` from those edges). The `CREATED`
activity row's `newValue` also records the source so history is self-describing.

**Rationale**: SC-007 / FR-CAP-002 require the source on the item **and** in activity. A first-class
column is filterable/indexable and trivially surfaced as a badge (D17); duplicating it into activity
keeps the audit entry self-contained (the existing activity pattern stores a `newValue` JSON). Reporter
attribution already exists via `reporterId`; source is orthogonal and additive.

**Alternatives considered**: (a) Source only in activity JSON — rejected: not queryable, badge needs a
join/scan. (b) A separate `capture_metadata` table — rejected: over-normalized for one enum + the
already-present reporter; revisit if richer provenance (channel id, message ts) is needed in v2.

### D7 — Slack idempotency via deterministic BullMQ `jobId`; ack then process async

**Decision**: The slash/interactivity handler verifies (D4), enqueues a `slack-capture` job with a
**deterministic `jobId`** derived from stable Slack identifiers (e.g.
`slack:{team_id}:{command|view}:{trigger_id|event ts}`), and **immediately acks** Slack (200 within the
3 s window). The worker creates the item and posts confirmation via `response_url`/`chat.postMessage`.
BullMQ rejects a second `add` with the same `jobId`, so a Slack retry can't enqueue a duplicate.

**Rationale**: Satisfies FR-SLK-014 / SC-006 (3 s ack + idempotent replay) with the existing BullMQ
infrastructure and **no new dedup table** — `jobId` uniqueness is the idempotency key. Decoupling ack
from work also protects the ≤300 ms server-side create budget (FR-CAP-001) from Slack's latency.

**Alternatives considered**: (a) A `slack_event_dedup` table with a unique constraint — rejected:
BullMQ's `jobId` already provides exactly-once enqueue; a table is redundant for the short retry window.
(b) Redis `SETNX` key — rejected: same effect as `jobId`, more moving parts. (c) Process synchronously
and ack at the end — rejected: risks blowing the 3 s window on slow creates.

### D8 — Capture routing & captor attribution (default project; unmapped fallback)

**Decision**: The Slack connection stores an admin-chosen **default project** (`default_project_id`);
the slash path routes captures there. The modal path (D-modal) includes a **project picker** that
overrides it. **Captor attribution**: if the Slack user maps to a RyTask user, run the capture under
**that user's principal** (correct RBAC + `reporterId`); if unmapped, run under the connection's
**install principal** with `reporter = null`, set `source = SLACK`, and send the captor an ephemeral
"link your account" prompt (US5 scenario 3). If the routed project is inaccessible, fall back to a safe
default and warn — never lose the capture (Edge Cases).

**Rationale**: A slash line carries no project (and `#` is a label, D5), so a connection default is
required to create anything. Running mapped captures under the real user keeps permission checks honest;
the unmapped fallback to the install principal is justified because an admin authorized the app to
capture — capture still succeeds (FR-SLK-012) and attribution self-heals once linked.

**Alternatives considered**: (a) Reject unmapped captures — rejected: violates "never block capture".
(b) Per-channel default project — rejected: explicitly v2 (FR-INT-SLACK-012). (c) Always run as the
install principal even when mapped — rejected: loses the RBAC/attribution fidelity that makes Slack
capture trustworthy (US5 rationale).

### D9 — MCP authenticates by PAT → the same `Principal`, enforcing scope ∩ role

**Decision**: `mcp-auth.ts` extracts the PAT (HTTP `Authorization: Bearer`; stdio `RYTASK_PAT` env),
resolves it through the **existing** identity token verification into a `Principal`
(user/org/role/scopes), and every tool call goes through the same `patHasPermission(role, scopes, perm)`
check (default-deny). A read-only-scoped token cannot mutate even if the user could (effective =
intersection). PAT revoked mid-session → the next call fails auth cleanly.

**Rationale**: FR-MCP-002 / FR-RBAC-009 demand identical RBAC + tenant isolation to the UI/API. Reusing
the M0 token stack (the `MCP` `token_type` already exists) means one auth implementation, not two. The
intersection semantics and revocation behavior are already implemented for REST PATs and carry over.

**Alternatives considered**: (a) A separate MCP credential type/format — rejected: `api_tokens` already
models MCP tokens and last-used; a parallel system would fragment revocation/governance. (b) OAuth for
MCP — rejected: out of scope; PAT is the spec'd mechanism (FR-MCP-002).

### D10 — Two transports: streamable HTTP/SSE on `api`, stdio as a third entrypoint

**Decision**: Use `@modelcontextprotocol/sdk` to build one `McpServer` from the registry, exposed over
**(a)** a streamable-HTTP/SSE endpoint mounted in the Nest `api` app at `/mcp` (PAT in the
`Authorization` header), and **(b)** a **stdio** entrypoint `main.mcp.ts` (a third boot mode of the same
image, like the `worker`), authenticating via `RYTASK_PAT` and sharing the in-process services.

**Rationale**: FR-MCP-001 requires both transports. Serving HTTP from the existing `api` process and
making stdio another entrypoint of the **same image** honors Principle VII (one image, differentiated by
entrypoint) — no new service in compose. The SDK gives us spec-compliant framing/streaming for free.

**Alternatives considered**: (a) A standalone MCP microservice — rejected: new deployable, breaks
one-command self-hosting and the shared-image rule. (b) HTTP only — rejected: stdio is required and is
the lowest-friction local path for Claude Code.

### D11 — Credential / browser-OAuth flows are excluded from MCP parity **by design**

**Decision**: Keep auth credential flows (register/login/refresh/logout/verify/reset/bootstrap) and the
**Slack browser-OAuth install/callback** out of `serviceCapabilities` — they are not agent-performable
and their absence is **not** a parity gap. This continues the existing documented exclusion in
`check-mcp-parity.ts` and `registry.ts`.

**Rationale**: An agent authenticates by PAT and never logs in or clicks a Slack consent screen.
Principle IV is about capabilities an agent *can and should* perform; transport/credential bootstrap is
explicitly outside it (already encoded in the registry comments). This keeps the parity gate honest
rather than padding it with uninvokable tools.

**Alternatives considered**: (a) Add stub MCP tools for these — rejected: they'd be uninvokable and
misleading. (See Complexity Tracking in plan.md for the *other* deferral — Slack connection
**management** endpoints, which differ from install in that they're data ops but are still v2 per spec.)

### D12 — MCP results are structured/typed; errors are categorized

**Decision**: Each tool returns a structured payload (the same DTO shape the REST endpoint returns,
defined in `packages/contracts`), and `mcp-errors.ts` maps domain exceptions to three categories —
**validation** (bad input / zod failure), **permission** (RBAC/tenant denial), **not-found** (missing
entity) — returned as MCP tool errors with a stable `code` + human message. No partial mutation on
error (services are already transactional).

**Rationale**: FR-MCP-004 / US8 scenario 4 require typed results and clear, categorized errors. Mapping
once at the edge gives every tool consistent behavior; reusing the REST DTOs keeps the contract
single-sourced.

**Alternatives considered**: (a) Free-text errors — rejected: agents need machine-distinguishable
categories. (b) Per-tool bespoke error handling — rejected: duplicative and drift-prone.

### D13 — Per-tool I/O schemas live in `packages/contracts/src/mcp/tool-io.ts`

**Decision**: Add a `tool-io.ts` mapping each registry tool name to its **input** zod schema and
**output** type, reusing the existing `*.contract.ts` zod schemas where they exist (e.g.
`createWorkItemSchema`). The MCP dispatcher validates input against this before calling the service.

**Rationale**: Keeps the "single contract, drift-proof" promise — MCP tool inputs are the same schemas
REST validates, so a field added in one place is enforced in both. Lives in `contracts` so the SDK and
both transports share it.

**Alternatives considered**: (a) Inline zod in each tool handler — rejected: drifts from REST DTOs. (b)
Generate from OpenAPI — rejected for M3: the contracts package already holds canonical zod; generation
is a v2 optimization.

### D14 — Pagination/filtering/field-selection envelope with an opaque cursor

**Decision**: List/search tools accept `{ filter?, limit?, cursor?, fields? }` and return
`{ items, nextCursor }` via a shared `pagination.ts` wrapper over the existing keyset-paginated services.
`fields` trims the payload to stay within token budgets; `limit` is capped server-side; results are
**paged, never silently truncated** (Edge Cases).

**Rationale**: FR-MCP-005 / US4 scenario 3 require cursored, filtered, field-selectable results within a
token budget. The M1 services already do keyset pagination, so the wrapper is thin.

**Alternatives considered**: (a) Offset pagination — rejected: the services are keyset; offsets are
unstable under writes. (b) Return everything and let the client trim — rejected: blows token budgets and
contradicts the cursor requirement.

### D15 — Web surfaces slot into the 003 settings shell; one typed API client

**Decision**: Add `settings/integrations` (Slack connect/status/disconnect, US1), `settings/integrations/
slack-users` (mapping, US5), and `settings/agent-access` (MCP endpoint + steps + PAT panel, US6) using
the existing `page.tsx` + `*-client.tsx` pattern, a new `lib/api/slack.ts` typed against
`@rytask/contracts`, the existing `lib/api/tokens.ts` for agent PATs, and the `can()` capability map for
**cosmetic** admin gating. Add the Integrations and Agent-access entries to the app-shell nav.

**Rationale**: Reuses the proven 003 architecture (D6/D7/D8 of 003) — no new client patterns. The PAT
panel already exists (M0 `settings/tokens`); the Agent-access page reuses it and adds connection
instructions (FR-WEB-110/111). Server stays authoritative; client gating is courtesy (Principle VI).

**Alternatives considered**: (a) A standalone top-level Integrations route group — rejected:
inconsistent with where settings live today. (b) Build a fresh token UI — rejected: duplicates M0.

### D16 — OAuth connect: redirect to Slack, return to a status page; secrets server-side

**Decision**: "Connect Slack" hits the server install route (admin-gated), which redirects to Slack's
consent URL (state param = signed nonce bound to the org). Slack returns to the server
`oauth/callback`, which exchanges the code (D3), persists the **encrypted** bot token + team mapping +
auto-maps users by email, then redirects the browser back to `settings/integrations` showing
"Connected". No Slack secret ever touches the browser or a URL the client logs.

**Rationale**: FR-WEB-101 / FR-SLK-001 + Principle VI: the OAuth code exchange and bot-token storage are
server-only; the client just kicks off and observes status. The signed `state` nonce binds the callback
to the initiating org (CSRF defense) and to the verified admin.

**Alternatives considered**: (a) Client-side OAuth (implicit) — rejected: would expose secrets/tokens to
the browser. (b) Manual paste of a bot token — rejected: poor UX and fails the Albert/Marissa ≤5-step
test (SC-005).

### D17 — Source badge is a token-only `packages/ui` `Badge`, shown on item + activity

**Decision**: Render the capture source as a small `Badge` (Web / Slack / Agent / API) on the work-item
detail/list and as part of the `CREATED` activity entry, using semantic `var(--*)` tokens only (a
permitted hue via `--info-soft`/`--info-fg`; the badge for "Agent" reads MCP). No new icon chrome beyond
existing Lucide usage.

**Rationale**: FR-WEB-112 / SC-007 require the source visible on the item and in activity; the existing
`Badge` primitive + token system covers it with zero brand risk (Principle VIII), passing
`check-design-tokens`.

**Alternatives considered**: (a) Color-only indicator — rejected: fails WCAG (color alone) and the
plain-language test; the badge carries a text label. (b) A bespoke component — rejected: `Badge` already
fits.

## Resolved unknowns (approach decisions → where answered)

| Question | Resolution |
|---|---|
| Where does Slack live — module or edge? | D1 — Slack is a bounded module; MCP is a transport edge |
| How do off-request paths stay tenant-safe? | D2 — `tenant.run(...)` from a server-resolved principal |
| Real Slack client without owning HTTP? | D3 — extend `SlackPort`; adapter on `@slack/web-api`+`@slack/oauth`; keep `noopSlack` default |
| How are forged Slack requests rejected? | D4 — `SlackSignatureGuard` (HMAC v0 + 5-min window) over raw body |
| One grammar across channels? | D5 — reuse `parseQuickAdd` verbatim; `#` stays a label |
| How is source recorded for SC-007? | D6 — `work_items.source` (`captureSourceEnum`) + activity `newValue` |
| 3 s ack + no duplicate on retry? | D7 — verify → ack → async BullMQ job with deterministic `jobId` |
| Which project; who is the captor? | D8 — connection default project (modal can override); mapped→user principal, unmapped→install principal + link prompt |
| How does MCP authenticate + enforce RBAC? | D9 — PAT → `Principal`; `patHasPermission` (scope ∩ role) |
| Which MCP transports, where served? | D10 — streamable HTTP/SSE on `api` + stdio third entrypoint (same image) |
| Are credential/install flows a parity gap? | D11 — excluded by design (agent-non-performable); D12-plan Complexity row covers mgmt endpoints |
| Typed results + categorized errors? | D12 — reuse REST DTOs; map to validation/permission/not-found |
| Where do per-tool schemas live? | D13 — `packages/contracts/src/mcp/tool-io.ts`, reusing existing zod |
| Pagination within token budget? | D14 — `{filter,limit,cursor,fields}` → `{items,nextCursor}` keyset wrapper |
| How do the 4 web surfaces get built? | D15 — 003 settings shell + `lib/api/slack.ts` + reused PAT panel + `can()` |
| How does connect avoid exposing secrets? | D16 — server-side OAuth redirect/exchange; signed `state`; encrypted bot token |
| How is the source shown? | D17 — token-only `Badge` on item + activity |

## MCP parity scope for M3 (explicit)

- The enforced gate `scripts/check-mcp-parity.ts` stays **green at 49/49** — every shipped
  capture/triage/track capability has exactly one live tool and no tool is orphaned. M3 makes these
  tools **callable** (transport) without changing the list.
- **Excluded by design** (D11, not gaps): auth credential flows + Slack browser-OAuth install/callback.
- **Deferred per spec** (plan.md Complexity Tracking): Slack connection-management tools
  (disconnect/map-user) and the **formal milestone-wide** parity gate (FR-INT-MCP-009/011) → v2.
- **Not yet built** ⇒ no tool (correct): time tracking, cycles/milestones, custom fields, automations,
  reports/dashboards, webhooks — they ship with their owning milestones.

## New dependencies introduced (all additive; no fixed-role substitution)

Runtime — `@slack/web-api`, `@slack/oauth` (Slack adapter, D3); `@modelcontextprotocol/sdk` (MCP server
+ transports, D10). Node built-in `crypto` for HMAC (D4) and AES-256-GCM bot-token encryption (no new
dep). Dev — additional Vitest integration/contract specs and Playwright e2e (existing runners). Already
present and reused: NestJS, Drizzle, BullMQ, `@rytask/contracts`, `@rytask/ui`, TanStack Query,
`lucide-react`.
