# Contract: Activity-feed integration & entry-source vs capture-source

**Feature**: `005-time-tracking-flagship` | **Phase**: 1

The *finalize* contract (FR-FIN-001, FR-FIN-002): how time events join the existing M1 activity feed
without breaking module boundaries, and how a time entry's **source** stays distinct from a work item's
**capture source**.

---

## 1. Time events in the activity feed (FR-FIN-001 — research D7/D8)

### 1.1 Five new activity actions
`activityActionEnum` gains (append-only, never reordered):
`TIME_STARTED`, `TIME_STOPPED`, `TIME_LOGGED`, `TIME_EDITED`, `TIME_DELETED`. They flow through the **same**
`activity` table the M1 feed already renders — interleaved with `CREATED`/`UPDATED`/`COMMENTED`/… by
`created_at`, each with `actor_id` and timestamp.

### 1.2 Boundary-respecting append (the `comments` pattern, verbatim)
`activity` is owned by the **work-items** module; a sibling module must not touch it directly (Principle
III). Time tracking appends through new methods on the **work-items contract** —
`apps/api/src/modules/work-items/work-items.contract.ts`:

```ts
// Added to WorkItemAccessService (the cross-module port behind WORK_ITEM_ACCESS).
recordTimeStarted(workItemId: string, actorId: string | null): Promise<void>;
recordTimeStopped(workItemId: string, actorId: string | null, durationSeconds: number): Promise<void>;
recordTimeLogged(workItemId: string, actorId: string | null, durationSeconds: number): Promise<void>;
recordTimeEdited(workItemId: string, actorId: string | null, before: unknown, after: unknown): Promise<void>;
recordTimeDeleted(workItemId: string, actorId: string | null, before: unknown): Promise<void>;
```

Implemented in `WorkItemAccessServiceImpl` over the work-items-owned `ActivityRepository`
(`action`, `field`, `old_value`, `new_value`), exactly as `recordCommented` is today. The time-tracking
providers inject `WORK_ITEM_ACCESS` and call these — **never** `ActivityRepository`. `dependency-cruiser`
allows the `*.contract.ts` import and blocks any internal one.

### 1.3 What each event records
| Action | When | `old_value` / `new_value` |
|---|---|---|
| `TIME_STARTED` | timer started on the item | `new: { startedAt }` |
| `TIME_STOPPED` | timer stopped → entry finalized | `new: { durationSeconds }` |
| `TIME_LOGGED` | manual entry created | `new: { durationSeconds, source: 'MANUAL' }` |
| `TIME_EDITED` | entry edited (incl. classification override) | `old`/`new` of changed fields (who-changed-what — audit, FR-TT-003) |
| `TIME_DELETED` | entry soft-deleted | `old: { durationSeconds, … }` |

The append is **synchronous** with the write (same request), so the audit row and the data never diverge.
(Time tracking may *additionally* emit a `time-log.created` domain event for future notifications, mirroring
`comment.created`; that is fan-out, not the audit path.)

### 1.4 Rendering
The item-detail activity feed (`GET /work-items/:id/activity`) returns the new actions in its existing
`ActivityEntry[]`; the `ActivityEntry.action` union in `packages/contracts/src/work-items.contract.ts` is
extended with the five `TIME_*` strings (output-only — no input contract changes). The web maps them to
friendly lines. No new endpoint; no change to the feed's shape (FR-FIN-003).

---

## 2. Entry source vs capture source — distinct, both correct (FR-FIN-002 — research D14)

Two provenances answer two different questions and live in two different columns:

| | Column | Enum | Values | Set by | Means |
|---|---|---|---|---|---|
| **Item capture source** (M3) | `work_items.source` | `captureSourceEnum` | `WEB` / `SLACK` / `MCP` / `API` | item creation channel | *how the item was captured* |
| **Time entry source** (M2) | `time_logs.source` | `timeEntrySourceEnum` | `TIMER` / `MANUAL` / `SLACK` / `MCP` / `API` | time-log creation path | *how the time was logged* |

- They are **independent**: tracking time on a **Slack-captured** item from the web produces a `time_log`
  with `source = TIMER` (or `MANUAL`) while the item keeps `source = SLACK`. Both are correct; neither
  overwrites the other (FR-FIN-002, US6).
- They **share only** the `SLACK`/`MCP`/`API` channel words (the spec's "shared vocabulary"); `TIMER`/
  `MANUAL` are time-only and `WEB` is capture-only — which is exactly why they are **separate enums**, never
  one reused for both (research D14).
- For M2, time entries are only ever `TIMER` or `MANUAL`; `SLACK`/`MCP`/`API` exist for forward-compat with
  the v2 time channels (FR-TT-004) and are unreachable this milestone.

### 2.1 Where surfaced
- The List row keeps the M3 **capture-source badge** on the item (unchanged).
- Each time-entry row on item detail shows its **own** source (`Timer` / `Manual`) — visibly distinct from
  the item badge. The two are never conflated in the UI.

---

## 3. No-regression guarantees (FR-FIN-003)

- `work_items.source`, `users.organizationId`, `project_members`, `TenantScopedRepository`, and the
  **49-tool MCP registry** are **unchanged**. The only schema deltas are the two new tables, the two new
  enums, and the five appended `activity_action` values.
- The work-items contract is **extended** (new methods), not altered — existing methods/signatures
  (`recordCommented`, `getItemContext`, watchers, …) are untouched, so `comments`/`notifications` keep
  working.
- The activity feed endpoint and shape are unchanged (only the `action` value-set grows), so the 003 detail
  view keeps rendering — now including time events.
