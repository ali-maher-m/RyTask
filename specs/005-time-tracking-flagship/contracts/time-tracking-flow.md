# Contract: Timer lifecycle, invariants & classification flow

**Feature**: `005-time-tracking-flagship` | **Phase**: 1

The behavioral contract behind the REST surface — the rules the domain policies + providers must enforce
and the integration/unit tests must assert. Every clause cites the requirement it satisfies.

---

## 1. One active timer per user (FR-TT-001, SC-002 — research D3)

- A `timers` row exists **iff** the user has a running timer. The DB constraint
  `UNIQUE(organization_id, user_id)` is the invariant — not an application check.
- **Start while idle**: insert `timers {userId, workItemId, startedAt = clock.now()}`.
- **Start while running on another item ("switch")**: **one transaction** —
  1. finalize the current timer → insert `time_log` (`source = TIMER`, `durationSeconds = round(now −
     startedAt)`, classification derived/snapshotted),
  2. delete the current `timers` row,
  3. insert the new `timers` row.
- **Concurrent double-start**: the second insert hits the unique violation; the provider catches it and
  resolves to the already-running timer. **No sequence of starts/stops ever yields two active timers**
  (SC-002 — asserted by an integration test that fires concurrent starts).

**Policy**: `domain/one-active-timer.policy.ts` (pure) decides switch-vs-start and the finalize shape;
unit-tested.

---

## 2. Server is the source of truth (FR-TT-009, SC-001 — research D4)

- `started_at` is written from the **`CLOCK` port** server-side; the client never supplies a start time.
- **Elapsed is derived, never stored**: the client renders `now − startedAt`; `GET /timers/active` re-syncs
  on load. After a **page reload** or **server restart** the timer is still running with the correct
  elapsed time because the row (with `started_at`) survives — nothing client-side is authoritative.
- **Two tabs** showing the same timer both derive from the same `started_at`; they converge on any refresh.
- **Stop** computes `durationSeconds = round(clock.now() − started_at)` server-side and persists the entry.
- Using the `CLOCK` port makes stop-duration deterministic under test (frozen clock).

**Test**: integration test starts a timer, advances the injected clock, stops, asserts the persisted
`durationSeconds`; a second test reads `GET /timers/active` "after restart" (new app context, same DB) and
asserts the timer is still present with the right `startedAt`.

---

## 3. Manual entries (FR-TT-002, FR-TT-004 — research D5)

- Accept **either** `durationSeconds` **or** a `startedAt`+`endedAt` pair (exclusive-or; `400` if both or
  neither). A duration-only entry resolves `startedAt` from `date` (default = today in server TZ) and sets
  `endedAt = startedAt + durationSeconds`, so the stored shape is **identical** to a timer entry — manual
  and timer entries are indistinguishable in how they sum (SC-004).
- `duration.policy` validates: `endedAt > startedAt`, `0 < durationSeconds ≤ cap` (reject zero/negative/
  absurd — Edge Cases), friendly message on failure, **nothing persisted** on reject.
- `source = MANUAL` is forced server-side. `billable` is a stored flag only (rates/cost are v3).

**Policy**: `domain/duration.policy.ts` (pure) — unit-tested across duration-only, start/end, and the
invalid forms.

---

## 4. Planned vs interruption classification (FR-TT-006, SC-005 — research D6)

- **Default derivation at creation** (`classification.policy`): the item's priority `URGENT` ⇒
  `INTERRUPTION`; otherwise `PLANNED`. (Where an M1 label carries interruption semantics it may flip the
  default; priority is the deterministic baseline.)
- The derived value is **snapshotted** onto `time_logs.classification`; later changes to the item's priority
  do **not** retroactively re-split history.
- **Explicit override**: supplying `classification` on create/edit sets the value and
  `classificationOverridden = true`. The override "sticks" through subsequent edits unless changed again.
- **Reconciliation invariant**: every entry has exactly one class, so for any item/user/project/period,
  `plannedSeconds + interruptionSeconds === loggedSeconds` (SC-005 — asserted by the aggregation test).

**Policy**: `domain/classification.policy.ts` (pure) — unit-tested for Urgent⇒interruption, normal⇒planned,
and override precedence.

---

## 5. Edit, delete & audit (FR-TT-003, SC-006/SC-007 — research D7/D9)

- **Permission** (`time-edit-permission.policy`, default-deny): edit/delete a log iff
  `actor === log.userId || principal.isOrgAdmin`. A non-owner non-admin is denied **server-side** (`403`),
  nothing changes (SC-006). Client role-gating is cosmetic.
- **Audit**: every create/edit/delete appends to the **item activity feed** via the work-items contract —
  `TIME_LOGGED` / `TIME_EDITED {old,new}` / `TIME_DELETED {old}` — recording who/what/when (research D7/D8).
  No separate audit table.
- **Delete** is **soft** (`deleted_at`), recoverable; aggregations exclude it immediately.

**Policy**: `domain/time-edit-permission.policy.ts` (pure) — unit-tested for owner-allow, admin-allow,
other-deny.

---

## 6. Idempotent / replay-safe writes (FR-X-004, SC-007 — research D13)

- `start`, `stop`, and manual `create` accept `Idempotency-Key` and run through `IdempotencyService.run`
  (Redis `SET NX`; cached response; `409` on an in-flight duplicate).
- `start` is **additionally** guarded by the `timers` unique constraint, so even without a key a duplicated
  start cannot create two timers.
- A **retried stop** returns the **same** finalized `time_log` (the cached result), never a second entry —
  time is counted **exactly once** (SC-007 — asserted by a replay integration test).

---

## 7. Tenant resolution & isolation (FR-X-001, SC-006 — research D1/D9)

- The active tenant comes from the authenticated principal (AsyncLocalStorage), set by `TenantGuard` — it
  is **never** read from a request body/query/header. Every repository extends `TenantScopedRepository`
  (auto `WHERE organization_id = :orgId`); raw unscoped access is forbidden.
- A user in org A reading/editing org B's timer or entry by any path gets `404`/empty (zero leakage) —
  asserted by `timers.tenancy.spec.ts` and `time-logs.tenancy.spec.ts`.

---

## 8. Aggregation reconciliation (FR-TT-005, SC-005 — research D10)

- All totals are pure `SUM(duration_seconds)` over `time_logs`, tenant-scoped, excluding soft-deleted logs
  **and** logs of soft-deleted items (research D15).
- For every grouping (item / user / project / period) and the planned/interruption split, the total equals
  the exact sum of the contributing entries, and changing an entry updates every affected total
  consistently — asserted by an integration test that logs known entries across two items/two days and
  checks each grouping equals the hand-computed sum (and re-checks after an edit).

---

## 9. Edge-case behavior (spec Edge Cases)

| Edge case | Contracted behavior |
|---|---|
| Timer left running overnight | Keeps accruing; stop records the full span; correctable (US4). Idle/reminders are v3. |
| User loses item access mid-run | The timer is theirs; stop still finalizes a `time_log` attributed to them — accrued time never silently lost (research D4/D9). |
| Manual entry end < start / zero / absurd duration | `400` validation, friendly message, nothing persisted (`duration.policy`). |
| Logging time on an item with **no** estimate | Allowed; the meter shows logged time with **no** over/under judgement (FR-WEB-201). |
| Edit that changes classification or project | Aggregations recompute consistently; change audited (`TIME_EDITED`). |
| Deleting an item with time entries | Logs persist but drop out of aggregation/meter; hard purge cascades (research D15). |
| Concurrent stop + edit of one entry | Resolved without double-count/lost-update (idempotent stop + row-level write). |
| Reopening a completed item, tracking more | Permitted; totals + meter update. |
