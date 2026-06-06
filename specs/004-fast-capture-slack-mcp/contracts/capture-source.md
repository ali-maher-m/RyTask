# Contract: Capture source (cross-channel provenance)

**Feature**: `004-fast-capture-slack-mcp` | FR-CAP-002, FR-SLK-013, FR-MCP-006, SC-007 | research D6/D17

One vocabulary for "where did this task come from?", recorded server-side at creation and surfaced on
the item and in its activity — so a team can trust and audit cross-channel capture.

## 1. Vocabulary

`captureSourceEnum = ['WEB', 'SLACK', 'MCP', 'API']` (`packages/db/src/enums.ts`). Display labels:

| Stored | UI label | Set when |
|---|---|---|
| `WEB` | Web | Created from the web UI (default) |
| `SLACK` | Slack | Created by the Slack edge (`/task` slash or modal) |
| `MCP` | Agent | Created by an MCP tool (agent via PAT) |
| `API` | API | Created by a non-UI REST call (e.g. PAT-over-REST, scripts) |

The stored vocabulary aligns with the canonical source vocabulary (FR-TT-004); "Agent" is the
human-facing label for `MCP` (research D17).

## 2. Where it is set (server-authoritative)

`WorkItemsService.create({ …, source })` writes `work_items.source` and records it in the `CREATED`
activity row's `newValue` (research D6). The channel — not the client — decides the value:

| Channel | `source` | `reporterId` (attribution) |
|---|---|---|
| Web UI (existing) | `WEB` (default) | the signed-in user |
| Slack `/task` (slash/modal) | `SLACK` | mapped user, else `null` + link prompt (research D8) |
| MCP tool | `MCP` | the PAT's user (acting principal) |
| Non-UI REST / PAT-over-REST | `API` | the calling principal |

`source` is **orthogonal** to `reporterId`: source = the channel, reporter = the person. Neither is
client-overridable on the create body (the edge sets `source`; the principal sets reporter).

## 3. Where it is surfaced (FR-WEB-112, SC-007)

- **On the item** (detail + list): `SourceBadge` (`web-surfaces.md` §3.D) — a token-only `Badge` with a
  **text label** (Web/Slack/Agent/API), so it is not color-alone (WCAG).
- **In activity**: the `CREATED` entry shows the source and the attributed user, making the history
  self-describing for audit (US7.2).

## 4. Invariants & tests

| Invariant | Requirement | Where asserted |
|---|---|---|
| Every item records a `source` (never null) | FR-CAP-002 | schema `NOT NULL` + create integration |
| Slack captures ⇒ `source = 'SLACK'` + attributed user | FR-SLK-013, SC-007 | `slack-capture.processor.int.spec.ts` |
| MCP captures ⇒ `source = 'MCP'` + acting principal | FR-MCP-006, SC-007 | `create_issue` MCP contract/integration |
| Source recorded on item **and** in activity | SC-007 | create integration (assert column + activity `newValue`) |
| Badge shows correct origin + attributed user | FR-WEB-112, SC-007 | `source-badge.component` + item-detail e2e |
| 100% of Slack/agent items show correct source | SC-007 | the above, across all four sources |
