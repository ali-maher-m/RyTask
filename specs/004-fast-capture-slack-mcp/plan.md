# Implementation Plan: Fast Capture Everywhere — Slack & MCP (Milestone M3)

**Branch**: `004-fast-capture-slack-mcp` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fast-capture-slack-mcp/spec.md`

## Summary

M3 makes RyTask's headline promise real — *write down the thing that just interrupted you, from
wherever it lands, in seconds* — by adding the two new capture-and-control **channels** that sit
alongside the web quick-add already shipped in M0+M1: **first-class Slack capture** (D2) and the
**first-party MCP server** (D3). Both are **clients of the same domain model and permission system** as
the web app — one brain everywhere. No new *business* capability is invented; M3 exposes the existing,
stable M0 (Identity/Tenancy) and M1 (Core Work Loop) use cases through two new edges, plus the web
surfaces that govern them (Integrations/Slack settings, Slack user-mapping, Agent/MCP access) and a
cross-channel **capture-source** badge.

The technical approach follows the codebase's established seams. **Slack** becomes a new bounded module
(`apps/api/src/modules/slack`) with a signature-verified webhook controller, an OAuth install flow, a
BullMQ capture queue (verify → ack within Slack's 3 s window → process async → idempotent on replay via
deterministic `jobId`), and a real adapter behind the already-present `SlackPort` seam. Captures reuse
the **existing M1 quick-add parser verbatim** and call the **existing `WorkItemsService`** — so a Slack
task is created by exactly the code path a web task is. **MCP** becomes a new transport *edge*
(`apps/api/src/mcp`) — not a back door — that authenticates a Personal Access Token into the same
`Principal`, establishes the same `TenantContext` (AsyncLocalStorage), and dispatches the **49 tools
already registered** in `packages/contracts/src/mcp/registry.ts` to the same services the REST
controllers use. The MCP server ships over remote streamable HTTP/SSE (served by the `api` process) and
local stdio (a third entrypoint of the same image, per Principle VII). Persistence adds three things
only: two tenant-scoped Slack tables (`slack_workspaces`, `slack_users`) and a `source` column on
`work_items` (`captureSourceEnum`). The four web surfaces reuse the 003 settings shell, the existing
PAT panel, the token-driven `packages/ui` primitives, and the cosmetic capability map — adding **zero**
new server entities beyond the Slack tables and the source column.

Decisions are recorded in [research.md](./research.md) (D1–D17); the persisted/transient model in
[data-model.md](./data-model.md); the REST, MCP-tool, Slack-flow, web-surface, and attribution
contracts in [contracts/](./contracts/); run/seed/verify and the CI gates in
[quickstart.md](./quickstart.md).

## Technical Context

**Language/Version**: TypeScript 5.7 (strict, `noUncheckedIndexedAccess`), Node 20+. Backend NestJS
(modular monolith); frontend Next.js 15 (App Router, RSC), React 19.

**Primary Dependencies**: Existing — NestJS, Drizzle ORM over PostgreSQL 16, Redis 7 + BullMQ,
`@rytask/contracts` (single contract source), `@rytask/ui` (token-driven components), the M1 quick-add
parser (`apps/api/src/modules/work-items/domain/quick-add.parser.ts`), the M0 PAT/`whoami`/RBAC stack
(`apps/api/src/modules/identity`, `common/guards`, `common/rbac`), and `TenantScopedRepository` +
`TenantContextService` (AsyncLocalStorage). **New (all additive; no fixed-role substitution)** —
`@slack/web-api` (post messages / open modals), `@slack/oauth` (`InstallProvider` for the consent
flow), and `@modelcontextprotocol/sdk` (MCP server + stdio & streamable-HTTP/SSE transports). Slack
signature verification is implemented from primitives (HMAC-SHA256), not a framework that wants to own
the HTTP server. Web reuses TanStack Query + Context, `lucide-react`, CSS Modules + semantic `var(--*)`.

**Storage**: PostgreSQL 16 via Drizzle (`packages/db/src/tables.ts` is the source of truth). New:
`slack_workspaces` and `slack_users` (both tenant-scoped, `organization_id`-leading composite indexes)
and a `work_items.source` column (`captureSourceEnum`: `WEB`/`SLACK`/`MCP`/`API`, `NOT NULL`,
default `WEB`). Slack bot tokens are encrypted at rest (AES-256-GCM) with a key from env. The MCP
"active workspace" is **transient** (per-session, in-memory) — no new persisted entity. PATs are the
**existing M0** `api_tokens` table (`token_type` already includes `MCP`); reused, not new.

**Testing**: Vitest (unit + integration against **real PostgreSQL** via testcontainers), supertest
(contract), Playwright + `@axe-core/playwright` (web e2e + a11y). New `module.testplan.ts` for the
`slack` module and the `mcp` edge declare required tests; the existing `scripts/check-required-tests.ts`
fails the build on any missing required test. Every Slack/MCP provider → ≥1 integration test; every
route → a contract test; **every MCP tool → a contract test**; the Slack webhook → an integration test
asserting verify → ack → async → idempotent-on-replay; tenant-isolation tests prove no cross-tenant
leakage via Slack **or** MCP. Web adds e2e for connect-Slack and Agent-access to `apps/web/web.testplan.ts`.

**Target Platform**: Linux server (Docker), one image for `api` / `worker` / `mcp-stdio` differentiated
by entrypoint. Web targets modern evergreen browsers. MCP clients: Claude Code and any
MCP-spec-compliant client (stdio or streamable HTTP/SSE).

**Project Type**: Full-stack web application — backend capability (NestJS modules/edges + queue) **and**
web surfaces (Next.js settings screens + a source badge), extending the existing monorepo.

**Performance Goals**: Task creation via any channel completes server-side **≤300 ms p95** and confirms
near-instantly (FR-CAP-001, SC-002); Slack slash-command capture is end-to-end **≤5 s** from the user's
view (SC-001); the Slack webhook **acknowledges within Slack's 3 s window** in 100% of legitimate slow
operations by offloading to the queue (FR-SLK-014, SC-006); MCP list/search returns paged, cursor-bound
results within a token budget (FR-MCP-005).

**Constraints**: Multi-tenant by construction — the tenant is resolved server-side (MCP: from the PAT
principal; Slack: from the verified `team_id` → connection mapping) and **never** client-supplied;
cross-tenant access is impossible and asserted by tests (FR-X-001, SC-004). RBAC is enforced
server-side identically to the UI/API; for PAT/MCP the effective permission is the **intersection** of
token scope and user role (default-deny). Forged/invalid Slack requests are rejected (HMAC signature +
timestamp window); Slack retries never duplicate items (idempotent `jobId`). Secrets only via env;
Slack bot tokens encrypted at rest; no secret in any URL or log; PAT secret shown exactly once. New web
UI is token-only brand-conformant (Principle VIII) and passes `check-design-tokens`.

**Scale/Scope**: Two new backend edges + one new bounded module; 3 schema additions (2 tables, 1
column); the 49 already-registered MCP tools made live over 2 transports; ~6 Slack REST routes
(install/callback/commands/interactivity + admin status/map/disconnect); 4 web surfaces (Integrations/
Slack, Slack user-mapping, Agent/MCP access, source badge); 8 user stories (P1×4, P2×3, P3×1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still passing.*

- [x] **I. Fixed Technology Stack** — NestJS modular monolith + Next.js + Drizzle/Postgres + Redis/
      BullMQ, unchanged. New libraries (`@slack/web-api`, `@slack/oauth`, `@modelcontextprotocol/sdk`)
      are **additive client/transport adapters**; they substitute no fixed *role* (framework, ORM, DB,
      queue, tooling). Slack does not adopt a competing HTTP server — webhooks are plain Nest
      controllers with from-primitives HMAC verification. **PASS.**
- [x] **II. Multi-Tenancy by Construction** — `slack_workspaces` and `slack_users` carry
      `organization_id` (and `workspace_id` where relevant) `NOT NULL`, with `organization_id`-leading
      composite indexes, and their repositories extend `TenantScopedRepository`. The active tenant is
      resolved server-side — MCP from the PAT `Principal`, Slack from the **signature-verified**
      `team_id` → connection mapping — never from a client-supplied field. The Slack worker and MCP
      edge re-establish `TenantContext` via `tenant.run(...)` before any service call. Cross-tenant
      isolation via Slack and via MCP is asserted by dedicated tests (FR-X-001, SC-004). **PASS.**
- [x] **III. Modular Monolith & Hexagonal Architecture** — Slack is a new bounded module exposing a
      `slack.contract.ts` + domain events; it never reaches into another module's repositories — it
      calls `WorkItemsService` / `IdentityService` through their public contracts. MCP is a transport
      **edge** (like the REST controllers), not a privileged path: it resolves a principal and calls
      the same services. All external Slack I/O sits behind the extended `SlackPort`; MCP transport
      behind the SDK adapter; token encryption behind a `Crypto` port. `dependency-cruiser` enforces the
      boundaries. **PASS.**
- [⚠] **IV. API ↔ MCP Parity** — M3 **builds the MCP transport** so the 49 already-registered tools
      become callable; the enforced parity gate (`check-mcp-parity.ts`) stays **green at 49/49** — every
      shipped capture/triage/track capability has a live tool and no tool is orphaned. The MCP server
      is a contract client, not a back door (Principle IV intent upheld for the agent's job). **One
      deliberate, spec-authorized deferral**: the new Slack *connection-management* REST endpoints
      (install/oauth-callback/disconnect/map-user) do **not** get MCP tools in M3 — see Complexity
      Tracking. Browser-OAuth install is excluded by the same logic as M0 credential flows (research
      D11: an agent never performs a browser consent screen). **PASS with tracked deferral.**
- [x] **V. Test-First & Enforced Coverage (NON-NEGOTIABLE)** — New `module.testplan.ts` for `slack` and
      `mcp` declare required tests; `check-required-tests.ts` fails on any absence. Coverage: every
      provider → integration test (real Postgres); every route → contract test; **every MCP tool →
      contract test**; the Slack webhook → integration test (verify → ack → async → idempotent replay);
      tenant-isolation tests for both Slack tables and cross-tenant denial via Slack **and** MCP;
      Playwright e2e for connect-Slack (US1) and Agent-access (US6) added to `web.testplan.ts`. **PASS.**
- [x] **VI. Secure by Default** — Slack webhooks verify the request signature (HMAC-SHA256 + 5-min
      timestamp window) before any work; MCP authenticates via PAT and enforces the same RBAC guard
      (default-deny; effective = scope ∩ role). Secrets (Slack client id/secret, signing secret, token
      encryption key) come only from env; per-install bot tokens are encrypted at rest; no secret
      appears in a URL or log; the PAT secret is shown exactly once (existing M0 behavior). **PASS.**
- [x] **VII. One-Command Self-Hosting** — No new service. The MCP HTTP/SSE transport is served by the
      existing `api` process; MCP stdio is a third **entrypoint of the same image** (`WORKER`-style
      switch), consistent with the shared-image rule. `docker compose up` still stands the stack up;
      Slack/MCP remain inert (noop adapter) until their env is supplied — no manual undocumented step.
      **PASS.**
- [x] **VIII. Design System & Brand Fidelity** — The four new web surfaces use **only** semantic
      `var(--*)` tokens from `branding/colors_and_type.css` (via `packages/ui`; no copy-pasted hex/px),
      honor the flat aesthetic and brand invariants (Sunbeam fills take dark ink; the source badge uses
      a permitted semantic hue), meet WCAG AA contrast, and the copy passes the non-technical-teammate
      ("Albert/Marissa") test — "Connect Slack", "Connected", "Link account". Conformance is
      CI-enforced by `scripts/check-design-tokens.ts`. **PASS.**

**Result: all gates PASS, with one tracked, spec-authorized parity deferral (Principle IV) recorded in
Complexity Tracking. No other Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/004-fast-capture-slack-mcp/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — decisions D1–D17 (resolve approach; no open NEEDS CLARIFICATION)
├── data-model.md        # Phase 1 — NEW server entities (2 tables + 1 column) + transient/client state
├── quickstart.md        # Phase 1 — run/seed/verify each US + the CI gates
├── contracts/           # Phase 1 — REST, MCP-tool, Slack-flow, web-surface & attribution contracts
│   ├── README.md
│   ├── slack-rest.md            # OAuth install/callback, slash/interactivity webhook, admin REST
│   ├── slack-capture-flow.md    # signature → 3 s ack → async queue → idempotent replay; Block Kit
│   ├── mcp-server.md            # transports, PAT auth, context, tool I/O, pagination, errors (49 tools)
│   ├── web-surfaces.md          # route map + component contracts + role gating for the 4 UI surfaces
│   └── capture-source.md        # source vocabulary (web/slack/mcp/api) + where surfaced
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/api/src/
├── modules/
│   └── slack/                              # NEW bounded module (Principle III)
│       ├── slack.module.ts
│       ├── slack.contract.ts               # public service interface + tokens (SLACK_CONNECTIONS, …)
│       ├── module.testplan.ts              # required-tests declaration (Principle V)
│       ├── controllers/
│       │   ├── slack-oauth.controller.ts          # GET install (admin) + GET oauth/callback
│       │   ├── slack-events.controller.ts         # POST commands + POST interactivity (sig-verified)
│       │   ├── slack-admin.controller.ts          # status / list+map users / disconnect (RBAC)
│       │   └── *.controller.contract.spec.ts
│       ├── providers/                              # provider-per-operation
│       │   ├── connect-slack.provider.ts          # OAuth exchange → persist conn → auto-map by email
│       │   ├── disconnect-slack.provider.ts       # revoke creds + stop capture
│       │   ├── list-slack-users.provider.ts
│       │   ├── map-slack-user.provider.ts
│       │   ├── get-connection.provider.ts
│       │   ├── capture-from-slack.provider.ts     # worker-side: parse + WorkItemsService.create
│       │   ├── open-capture-modal.provider.ts     # views.open via trigger_id
│       │   └── *.provider.int.spec.ts
│       ├── repositories/
│       │   ├── slack-workspaces.repository.ts     # extends TenantScopedRepository
│       │   ├── slack-users.repository.ts          # extends TenantScopedRepository
│       │   └── *.tenancy.spec.ts
│       ├── processors/
│       │   ├── slack-capture.queue.ts             # BullMQ queue + worker (WORKER=1)
│       │   └── slack-capture.processor.ts         # idempotent (deterministic jobId)
│       ├── domain/
│       │   ├── slack-signature.policy.ts          # pure HMAC verify + timestamp window
│       │   └── slack-blocks.ts                    # pure Block Kit builders (modal + confirmation)
│       ├── guards/
│       │   └── slack-signature.guard.ts
│       └── events/
│           └── slack-connection.events.ts
├── mcp/                                     # NEW transport edge (NOT a domain module)
│   ├── mcp.module.ts
│   ├── mcp-server.factory.ts               # builds server from registry; registers tool handlers
│   ├── transport/
│   │   ├── mcp-http.controller.ts          # streamable HTTP/SSE under /mcp (served by api)
│   │   └── mcp-stdio.entry.ts              # third image entrypoint (local stdio)
│   ├── tools/
│   │   ├── tool-dispatch.ts                # name → service call; tenant.run + RBAC
│   │   ├── context-tools.ts               # whoami / list+get workspaces / set_active_workspace
│   │   └── pagination.ts                   # cursor + field-selection envelope
│   ├── mcp-auth.ts                         # PAT → Principal (reuses identity auth)
│   ├── mcp-session.ts                      # transient active-workspace per session
│   ├── mcp-errors.ts                       # validation / permission / not-found mapping
│   └── *.contract.spec.ts                  # one contract test per tool
├── common/
│   ├── ports/slack.port.ts                 # EXTENDED: postMessage + openModal + oauth + identity
│   ├── adapters/slack/slack.adapter.ts     # NEW real adapter (@slack/web-api + @slack/oauth)
│   └── crypto/                             # NEW Crypto port + AES-256-GCM adapter (bot-token at rest)
└── main.mcp.ts                             # stdio bootstrap (mirrors main.ts / worker switch)

packages/
├── db/src/
│   ├── tables.ts                           # + slackWorkspaces, slackUsers; + workItems.source
│   ├── enums.ts                            # + captureSourceEnum; + slackInstallStatus (if needed)
│   ├── migrations/                         # new generated migration
│   └── seed.ts                             # (optional) demo Slack connection for local verify
├── contracts/src/
│   ├── slack.contract.ts                   # NEW connection + user-mapping + command/modal DTOs
│   ├── work-items.contract.ts              # + `source` on WorkItem output; activity records source
│   └── mcp/
│       ├── registry.ts                     # unchanged (49 tools) — kept green by parity gate
│       └── tool-io.ts                      # NEW per-tool input/output zod + pagination envelope
└── sdk/                                    # regenerated from updated OpenAPI (slack admin + source)

apps/web/app/(app)/settings/
├── integrations/
│   ├── page.tsx + integrations-client.tsx          # Slack connect/status/disconnect (US1)
│   └── slack-users/
│       └── page.tsx + slack-users-client.tsx       # Slack↔user mapping (US5)
├── agent-access/
│   └── page.tsx + agent-access-client.tsx          # MCP endpoint+steps + PAT panel (US6)
apps/web/
├── lib/api/slack.ts                        # typed client for Slack admin endpoints
├── lib/api/tokens.ts                       # (reused/extended for agent PATs)
├── components/work-item/source-badge.tsx   # Web/Slack/Agent/API badge (US7)
└── web.testplan.ts                         # + connect-slack & agent-access e2e

infra/docker/                               # + Slack & MCP env vars (no new service)
scripts/                                    # existing gates apply; check-mcp-parity stays 49/49
```

**Structure Decision**: Full-stack extension of the existing monorepo. Slack is a **new bounded
module** under `apps/api/src/modules/` (it owns data + domain + a public contract). MCP is a **transport
edge** under `apps/api/src/mcp/` (it owns no domain; it authenticates and dispatches to existing
services, exactly as the REST controllers do) — this is what keeps API↔MCP parity structural rather
than duplicated. The four web surfaces slot into the existing `apps/web/app/(app)/settings/` shell with
the established `page.tsx` + `*-client.tsx` pairing. Schema lives in `packages/db/src/tables.ts` (single
source of truth); shared DTOs and per-tool I/O in `packages/contracts`.

## Complexity Tracking

> One justified, spec-authorized deviation from strict Principle IV (API↔MCP parity). The enforced
> parity gate (`check-mcp-parity.ts`) remains green at 49/49; this row documents the new
> *integration-admin* REST surface that intentionally lacks MCP tools in M3.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Slack connection-management REST endpoints (install / oauth-callback / disconnect / map-user) ship **without** corresponding MCP tools | M3's spec scopes "integration-admin tools" and the "formal milestone-wide 100%-parity CI gate" to **v2** (spec §Out of Scope, FR-INT-MCP-009/011). Install is a **browser-OAuth consent** flow an agent cannot perform — excluded by the same principle as M0 credential flows (research D11). These endpoints are admin *configuration*, not part of the agent's capture/triage/track job, which **is** fully covered (49/49). | Adding integration-admin MCP tools now would expand the tool surface beyond M3's MVP `Must` subset, pull in the deferred audit/event-parity work (FR-INT-MCP-005/008), and require modeling OAuth-over-MCP — all out of scope. Keeping them out of `serviceCapabilities` (as credential flows already are) preserves a green parity gate without faking coverage; the formal milestone-wide parity expansion lands with v2 as the spec directs. |

## Risks & follow-ups (non-blocking)

- **Slack 3 s ack vs. cold worker**: if the BullMQ worker is briefly unavailable, the webhook still
  acks (work is enqueued) but the confirmation is delayed. Mitigation: enqueue is the only synchronous
  work on the hot path; confirmation posts via `response_url`/`chat.postMessage` on completion.
- **Active-workspace transience (MCP)**: holding active workspace per-session in memory means a
  reconnect resets to the token/user default. Acceptable for M3 (spec marks it transient/selectable);
  persisting per-token defaults is a v2 nicety.
- **Bot-token encryption key rotation**: AES-256-GCM with an env key covers at-rest; key rotation
  tooling and Slack token rotation (FR-INT-SLACK-014) are v2.
- **Unmapped-captor authority**: unmapped Slack captures run under the connection's install principal
  with `reporter = null` + a "link your account" prompt (research D8). Revisit if teams want stricter
  "no capture until linked" behavior.
- **Integration-admin parity** (above): closes in v2 with the formal milestone-wide parity gate.
