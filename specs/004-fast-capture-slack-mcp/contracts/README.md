# Contracts: Fast Capture Everywhere — Slack & MCP (M3)

**Feature**: `004-fast-capture-slack-mcp`

M3 is full-stack, so unlike 003 it owns **new server contracts** at two new edges (Slack REST + MCP
tools) plus the **client-edge** contracts for the four web surfaces — while **reusing** the entire M0/M1
domain (`WorkItemsService`, identity/PAT/RBAC, `parseQuickAdd`) and the 49 already-registered MCP tools.
No new *domain* capability is introduced; these contracts describe how the new channels and screens bind
to the existing one.

| File | Contract | Requirements |
|---|---|---|
| `slack-rest.md` | Slack OAuth install/callback, signature-verified slash/interactivity webhooks, and admin REST (status / list+map users / disconnect) | FR-SLK-001/003/004, FR-WEB-101/102/103 |
| `slack-capture-flow.md` | The capture contract: signature verify → ≤3 s ack → async BullMQ (idempotent `jobId`) → confirmation; quick-add reuse; Block Kit modal | FR-SLK-010/011/012/013/014, SC-001/006 |
| `mcp-server.md` | MCP transports (stdio + streamable HTTP/SSE), PAT auth (scope ∩ role), session context, the M3 tool I/O over the 49 registry tools, pagination, typed errors | FR-MCP-001…006, SC-003/004 |
| `web-surfaces.md` | Route map, role-capability additions, and component contracts for Integrations/Slack, Slack user-mapping, Agent/MCP access, and the source badge | FR-WEB-101/102/103/110/111/112 |
| `capture-source.md` | The capture-source vocabulary (`web`/`slack`/`mcp`/`api`) and where it is recorded and surfaced | FR-CAP-002, FR-SLK-013, FR-MCP-006, SC-007 |

**Reused server contracts (unchanged, for reference):**
- M1 work-loop REST + Filter DSL: `specs/001-core-work-loop/contracts/{openapi.yaml,filter-dsl.md}`
- M0 identity/RBAC REST: `specs/002-identity-tenancy-onboarding/contracts/{openapi.yaml,rbac-matrix.md}`
- Quick-add grammar (client preview + server authority): `specs/003-frontend-m0-m1/contracts/quick-add-grammar.md`
- MCP tool **registry** (the 49-tool surface this milestone makes live):
  `packages/contracts/src/mcp/registry.ts` — kept green by `scripts/check-mcp-parity.ts`
- Shared DTOs/zod: `packages/contracts/src/*.contract.ts` (extended here: `work-items` `source`,
  new `slack.contract.ts`, new `mcp/tool-io.ts`)

**Authoritative-surface notes**
- The server is the sole authority. Slack tenant is resolved from the **signature-verified** `team_id`;
  MCP tenant/role from the **PAT principal** — never from client-supplied fields (Principle II).
- RBAC is server-side and identical to the UI/API; web role-gating is cosmetic (Principle VI).
- New web UI is token-only brand-conformant (Principle VIII), checked by `check-design-tokens`.

**Contract-test obligation (Principle V):** every Slack route and **every MCP tool** has a contract
test; every Slack/MCP provider an integration test (real Postgres); the Slack webhook an integration
test (verify → ack → async → idempotent replay); both Slack tables a tenancy test; cross-tenant denial
asserted via Slack **and** MCP; web e2e for connect-Slack (US1) and Agent-access (US6) declared in
`apps/web/web.testplan.ts`; Slack/MCP required tests declared in
`apps/api/src/modules/slack/module.testplan.ts` and the MCP edge's testplan. The closed-testing gate
(`check-required-tests.ts`) fails the build if any declared test is missing.
