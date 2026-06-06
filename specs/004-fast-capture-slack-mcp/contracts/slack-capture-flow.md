# Contract: Slack capture flow (verify → ack → async → confirm)

**Feature**: `004-fast-capture-slack-mcp` | FR-SLK-010/011/012/013/014, SC-001/006 | research D4/D5/D7/D8

The capture contract is the heart of D2. It guarantees: forged requests rejected, ack inside Slack's
3 s window, slow work done async, replays idempotent, capture never blocked, and every item recorded as
`source = SLACK` with the right captor.

## 1. Request integrity (FR-SLK-014, SC-006 — research D4)

Every `POST` to `/integrations/slack/commands` and `/integrations/slack/interactivity` passes
`SlackSignatureGuard` **before** any handler work:

```
basestring = `v0:${X-Slack-Request-Timestamp}:${rawBody}`
expected   = `v0=` + HMAC_SHA256(SLACK_SIGNING_SECRET, basestring)   // hex
verify: timingSafeEqual(expected, X-Slack-Signature)  AND  |now - timestamp| ≤ 300s
```

- Missing/invalid signature **or** stale timestamp ⇒ `401`, **no** item created, nothing enqueued.
- The pure check lives in `domain/slack-signature.policy.ts` (unit-tested with known vectors); the guard
  is the only thing that reads the **raw body** (configured per-route).

## 2. The 3-second ack & async hand-off (FR-SLK-014 — research D7)

The handler does the **minimum** synchronous work, then returns within 3 s:

```
verify(sig) ─▶ resolve connection by team_id ─▶ enqueue SlackCaptureJob(jobId) ─▶ 200 ack
                                                                                   │
                                                            (worker, WORKER=1)     ▼
                                          tenant.run(org,ws,captor) → WorkItemsService.create → reply
```

- **`jobId` is deterministic** (`slack:{team_id}:{slash|modal}:{trigger_id|command_ts}`). BullMQ refuses
  a duplicate `add` with the same `jobId`, so a Slack **retry creates no second item** (SC-006).
- The slash ack body is an **ephemeral** "On it — capturing…" (or empty 200); the real confirmation is
  posted later via `response_url`/`chat.postMessage` with the item key + deep link.
- If the resolved connection is missing/`revokedAt` set ⇒ the job is a **no-op** (no orphaned writes
  after disconnect — Edge Case).

## 3. Slash capture `/task …` (US2 / FR-SLK-010/012/013 — research D5/D8)

```
/task Fix login bug !urgent @ali #bugs ^Friday
```

1. Verify + ack (§1–2). Enqueue a `kind: 'slash'` job with the raw `text`.
2. Worker: resolve captor (`slack_users.slackUserId → userId`); resolve **project** = connection
   `defaultProjectId` (safe-default + warn if missing/inaccessible).
3. Worker calls `WorkItemsService.create({ projectId, quickAdd: text, source: 'SLACK', reporterId })`
   — **the same path the web uses**, with the **same `parseQuickAdd`** (research D5). `#bugs` is a
   **label** (grammar unchanged); `@ali`/`!urgent`/`^Friday` parsed; anything unparseable stays verbatim
   in the title and is reported (US2.3).
4. Reply (via `response_url`): item key + deep link, plus a note of "what was/wasn't applied"
   (unresolved tokens). If captor was unmapped, also prompt "link your account" (US5.3).

**Defaults & never-block (FR-SLK-012):** `/task Just the title` → item with title only, first workflow
status, priority `NONE`, `reporter` = captor (or null if unmapped). Capture is never blocked on missing
fields.

## 4. Modal capture (US3 / FR-SLK-011 — research D-modal)

`/task` with **no text** (or a "More options" affordance) opens an interactive modal:

1. Verify + ack. Because `views.open` needs the `trigger_id` within 3 s, the handler opens the modal
   **synchronously** via the Slack adapter (`SlackPort.openModal(trigger_id, view)`) using the pure
   Block Kit builder in `domain/slack-blocks.ts`, then acks.
2. Modal fields: **project** (picker, defaults to connection default), **assignee**, **priority**,
   **due date**, **title**, **description**.
3. On `view_submission` (→ `/interactivity`): verify + ack (≤3 s), enqueue a `kind: 'modal_submit'`
   job with the selected values.
4. Worker calls `WorkItemsService.create({ …selected, source: 'SLACK', reporterId })`; posts the
   confirmation (key + link). Title-only submit still creates with smart defaults (US3.3 / FR-SLK-012).

**Block Kit** views/messages are built by **pure** functions (`slack-blocks.ts`) so they are
unit-testable and contain no tokens/secrets.

## 5. Attribution & source (FR-SLK-013, SC-007 — research D6/D8)

| Captor state | Principal the create runs under | `reporterId` | Prompt |
|---|---|---|---|
| Mapped (`slack_users.userId` set) | that RyTask user | the user | — |
| Unmapped (`userId = null`) | the connection's install principal (admin) | `null` | "link your account" (US5.3) |

Every captured item: `source = 'SLACK'`, and the `CREATED` activity records the source (badge surfaces
it — `capture-source.md`).

## 6. Performance (FR-CAP-001/SC-002, SC-001)

- Synchronous hot path = verify + enqueue (well under 3 s; typically tens of ms).
- The `WorkItemsService.create` itself stays **≤300 ms p95** (FR-CAP-001) — unchanged from web.
- End-to-end user-visible capture **≤5 s** median for the slash path (SC-001): ack is instant, the
  confirmation follows on completion.

## 7. Tests (Principle V — declared in `slack/module.testplan.ts`)

| Test | Asserts |
|---|---|
| `slack-signature.policy.spec.ts` (unit) | valid/invalid signature; stale-timestamp rejection (known vectors) |
| `slack-events.controller.contract.spec.ts` | `401` on bad signature; `200` ack shape; no enqueue on reject |
| `slack-capture.processor.int.spec.ts` (real PG) | slash + modal create the right item; `source='SLACK'`; defaults; unresolved kept; mapped vs unmapped attribution |
| webhook **integration** (verify → ack → async → replay) | ack ≤3 s; item created async; **same delivery twice ⇒ one item** (idempotent `jobId`) |
| disconnect interplay | job after `revokedAt` ⇒ no write |
| `*.tenancy.spec.ts` | forged/foreign `team_id` cannot write into another org |
