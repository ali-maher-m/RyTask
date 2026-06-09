# Research & Decisions: Time Tracking (the flagship) — and finalizing M0→M3 (M2)

**Feature**: `005-time-tracking-flagship` | **Date**: 2026-06-08 | **Phase**: 0 (Outline & Research)

M2 invents no new technology and no new business *channel* — it applies the existing domain/tenancy/RBAC/
ports spine to a new entity (time) and weaves it into the four shipped milestones. There are therefore
**no open `NEEDS CLARIFICATION`** items: the spec's two scope forks were resolved before drafting
("integrate into shipped surfaces, no pull-forward"), and the remaining choices are *how* to map time
tracking onto the established seams. Each decision below is **Decision / Rationale / Alternatives**.

---

### D1 — Time tracking is a new bounded module (not an edge, not folded into work-items)

**Decision**: Create `apps/api/src/modules/time-tracking`, structurally identical to `work-items`
(controllers → providers-per-operation → `TenantScopedRepository` → domain policies → `events/` →
`module.testplan.ts`). It owns `timers` + `time_logs` and exposes a `time-tracking.contract.ts`.

**Rationale**: Time has real domain state and invariants of its own (one-active-timer, classification,
owner-or-admin edit, aggregation) — that is a bounded context, not a transport edge (Principle III). The
`work-items` module is the proven template (the codebase's largest module), so mirroring it minimizes
novelty and keeps `dependency-cruiser`, `check-required-tests`, and reviewers on familiar ground.

**Alternatives**: *(a)* Add timers/logs **inside** `work-items` — rejected: bloats an already-large module,
couples two contexts, and makes the "free, separable time-tracking" differentiator harder to reason about.
*(b)* A transport **edge** like MCP — rejected: an edge owns no data; time tracking owns two tables.

---

### D2 — Two tables: `timers` (active) + `time_logs` (finalized), as the spec names them

**Decision**: `timers` holds the **single in-progress accrual per user** (one short-lived row while
running); `time_logs` holds **finalized entries** (the atomic unit all aggregations sum). Stopping a timer
**deletes** its `timers` row and **inserts** a `time_logs` row in one transaction.

**Rationale**: The spec's Key Entities and Assumptions name exactly these two tables (`timers`, `time_logs`)
and treat Timer and Time Entry as distinct. Splitting them keeps each table's meaning crisp: a `timers` row
is always "running, no end yet"; a `time_logs` row is always "complete, has a duration." It also makes the
one-active invariant a trivial `UNIQUE(organization_id, user_id)` on `timers` (D3) and keeps aggregation
queries pure (only `time_logs`, never a half-finished row).

**Alternatives**: *Single `time_logs` table* with a running row (`ended_at IS NULL`) + a partial unique
index `WHERE ended_at IS NULL` — rejected: mixes live and finalized rows, complicates every aggregation
(`WHERE ended_at IS NOT NULL`), and contradicts the spec's named two-table model.

---

### D3 — One-active-timer-per-user as a DB UNIQUE constraint, not application discipline

**Decision**: `timers` carries `UNIQUE(organization_id, user_id)`. Because a `timers` row exists **only**
while running, this constraint *is* the "at most one active timer per user" invariant (FR-TT-001, SC-002).
Starting a timer while one runs is one transaction: finalize the existing timer into a `time_log`, then
insert the new `timers` row. Two concurrent starts: the second insert hits the unique violation, is caught,
and resolves to the now-running timer (no two-active state ever exists).

**Rationale**: Principle II / the architecture demand "make the safe path the only path." A DB constraint
holds under concurrency and crash where application checks do not (SC-002 requires 100%). The transaction
boundary guarantees no accrued time is dropped during the switch.

**Alternatives**: *Application-level "check then insert"* — rejected: races yield two active timers.
*Advisory locks* — rejected: heavier than a unique constraint for the same guarantee.

---

### D4 — Server time is the source of truth; the client computes elapsed from `startedAt` (no realtime)

**Decision**: A `timers` row stores `started_at timestamptz` set from the **`CLOCK` port** (server clock).
The API returns `startedAt`; the **client computes live elapsed** as `now − startedAt` and re-fetches the
active timer on load. Stop computes `duration_seconds = round(clock.now() − started_at)` **server-side**.
No realtime fan-out is added — the M1 realtime seam (deviation C2) stays deferred.

**Rationale**: FR-TT-009 / SC-001 require the timer to survive reload and server restart with the correct
elapsed time — which is exactly satisfied by persisting `started_at` server-side and deriving elapsed,
with zero client-held truth. Two tabs converge because both derive from the same `started_at`. Using the
`CLOCK` port keeps stop-duration deterministic in tests.

**Alternatives**: *WebSocket tick push* — rejected: unnecessary for correctness (the client can tick a
local clock from `started_at`) and would prematurely build the deferred realtime publisher. *Client-stored
start time* — rejected: violates "server is the sole authority" and breaks across devices/restart.

---

### D5 — Durations stored as `duration_seconds` integer; estimate reused as hours for the meter

**Decision**: `time_logs.duration_seconds` is an **integer** (exact seconds). Manual entries accept either
a **duration** or a **start/end** pair; the `duration.policy` derives/validates seconds (end > start,
0 < duration ≤ a sane cap). The meter compares `loggedSeconds` against the **reused** M1
`work_items.estimate_value`, **interpreted as hours** (`estimateSeconds = estimateValue × 3600`).

**Rationale**: Integer seconds give exact timer accrual and round-trip with no float drift, and sum
losslessly in aggregations (SC-005 "reconciles exactly"). Estimates already exist in M1 as a unitless
`numeric`; the branding meter shows hours, so hours is the natural interpretation and avoids adding an
estimate-units column (no M1 schema change → FR-FIN-003 no-regression). The hours mapping is isolated to
one place (the meter / rollup) for easy revisit.

**Alternatives**: *Store minutes/float* — rejected: minutes lose timer precision; floats drift and
mis-reconcile. *Add an estimate-units column to `work_items`* — rejected: changes an M1 table for no M2
requirement; out of scope.

---

### D6 — Planned vs interruption: derived once at creation, snapshotted, explicitly overridable

**Decision**: `time_logs.classification` is `timeEntryClassEnum` (`PLANNED` | `INTERRUPTION`), **NOT NULL**.
The `classification.policy` derives the default at entry creation: **item priority `URGENT` ⇒
`INTERRUPTION`, otherwise `PLANNED`** (a label carrying interruption semantics may also flip it where M1
labels make that available; priority is the deterministic baseline). The value is **snapshotted** onto the
row. An explicit `classification_overridden boolean` records a manual override so later edits to the item's
priority never silently re-split historical totals. Planned + interruption therefore **always sum to total**
(every row has exactly one class).

**Rationale**: FR-TT-006 requires a default derivation that is overridable and a split that always
reconciles. Snapshotting (not live re-derivation) is what makes the reconciliation invariant hold across
time and is what the future M4 interruption report needs (stable history). The Urgent⇒interruption rule is
the spec's stated example and the simplest deterministic default.

**Alternatives**: *Re-derive live from current item priority* — rejected: changing an item's priority would
retroactively rewrite past splits and break reconciliation. *Free-text tags* — rejected: a two-value enum
is what the report consumes and what guarantees the sum.

---

### D7 — Audit and the activity feed reuse the M1 `activity` mechanism — no new audit table

**Decision**: Time events appear in the **existing per-item `activity` feed** (FR-FIN-001). Add five values
to `activityActionEnum` — `TIME_STARTED`, `TIME_STOPPED`, `TIME_LOGGED`, `TIME_EDITED`, `TIME_DELETED` —
and record edits/deletes with `old_value`/`new_value` JSON (who-changed-what-when). **No separate
`time_log_audit` table.**

**Rationale**: The spec's Key Entities explicitly allow "Time Entry Audit … may reuse the existing
activity/audit mechanism." The `activity` table is append-only, already keyed on `work_item_id` (every time
entry belongs to an item), already carries `actor_id` + `old/new` JSON, and is already what the item
detail renders. Reusing it satisfies the audit requirement (FR-TT-003) **and** the feed-integration
requirement (FR-FIN-001) with one mechanism, and holds the schema to exactly two new tables (matching the
spec assumption).

**Alternatives**: *A dedicated `time_log_audit` table* — rejected: a third table the spec did not call for,
duplicating what `activity` already provides, and a second place the detail view would have to merge.

---

### D8 — Cross-module activity append via the work-items contract (`recordTime*`), like `comments`

**Decision**: The `time-tracking` module appends `TIME_*` activity by calling **new methods on
`work-items.contract.ts`** — `recordTimeStarted/Stopped/Logged/Edited/Deleted(workItemId, actorId, …)` —
implemented in `WorkItemAccessServiceImpl` over the work-items-owned `ActivityRepository`. This is the
**exact** pattern `comments` uses today (`recordCommented`), injected by the `WORK_ITEM_ACCESS` token.
Item-access checks (does this user/item pair resolve, what project) also go through this contract
(`getItemContext` / `canAccess`).

**Rationale**: `activity` is owned by `work-items`; Principle III forbids a sibling module reaching into it
directly. The established, dependency-cruiser-blessed way to cross that seam is a contract method —
verbatim what `comments`/`notifications` already do. Synchronous append keeps the time event and its audit
row consistent with the write.

**Alternatives**: *Emit a domain event and let work-items subscribe* — rejected as the primary path: adds
async ordering and would defer the audit row from the write; the codebase reserves events for fan-out
(notifications), not for owned-table writes. (Time-tracking may still emit a `time-log.created` event for
future notifications, mirroring `comment.created`, but the **audit/feed** write is the synchronous contract
call.) *Inject `ActivityRepository` directly* — rejected: a boundary violation the linter blocks.

---

### D9 — RBAC reuses `work:read`/`work:write`; owner-or-admin edit enforced default-deny in the provider

**Decision**: Time routes gate on the **existing** permissions — reads on `work:read`, writes on
`work:write` — because time access *is* work-item access (you can log/read time on an item exactly when you
can read/write it). Edit/delete of a **time entry** additionally enforces **owner-or-admin** in
`time-edit-permission.policy`: allowed iff `actor === entry.userId || principal.isOrgAdmin`, else denied
server-side (default-deny). The M0 role matrix and PAT scope list are **untouched**.

**Rationale**: Minimizes blast radius (FR-FIN-003 no-regression): no change to `permissions.ts` role
matrices, no new PAT scope, no migration of role assignments. It is also semantically correct — there is no
"time" resource separate from the work item it belongs to. The owner-or-admin nuance is per-entry policy,
which providers already own (the work-items update provider does analogous checks).

**Alternatives**: *Introduce `time:read`/`time:write` permissions* — rejected: forces edits to every role
matrix (OWNER/ADMIN/MEMBER/GUEST/VIEWER) and the PAT scope set, risking M0 contract drift for zero
behavioral gain. *Gate edit on `work:write` only (no ownership check)* — rejected: any MEMBER could rewrite
a teammate's time; the spec requires default-deny for non-owner non-admin (US4, SC-006).

---

### D10 — Aggregation is a query-only read-model (no materialized rollup table)

**Decision**: `time-summary.provider` answers per **item / user / project / period** and the **planned vs
interruption** split with tenant-scoped `SUM(duration_seconds) … GROUP BY` queries over `time_logs`,
filtered to non-deleted items. It returns the same totals the UI shows and the future M4 report will
consume. No materialized/rollup table is added.

**Rationale**: FR-TT-005 / SC-005 require every aggregation to reconcile **exactly** to the sum of its
entries — guaranteed when aggregations are pure SUMs over the single source rows. Materialized rollups are
explicitly **M4** (the spec defers report rollups). Org-leading composite indexes on `time_logs` keep these
queries cheap at Stage-1 scale.

**Alternatives**: *Maintain a `time_rollups` table on every write* — rejected: a cache to invalidate, a new
reconciliation risk, and out of M2 scope. *Per-cycle aggregation* — rejected: cycles aren't built yet
(spec Out of Scope); M2 covers item/user/project/period (+label where M1 labels allow).

---

### D11 — Row-meter totals via a parallel time-rollup fetch, merged client-side (boundary-safe)

**Decision**: The Board/List render the in-row meter from a **separate** `GET /time/rollup?projectId=…`
(returns `{ workItemId, loggedSeconds }[]` for the project), fetched **in parallel** with the items list
and **merged client-side** by `workItemId`. Work-items does **not** join `time_logs`.

**Rationale**: Principle III: work-items must not read another module's table, so `loggedSeconds` cannot be
a column on the work-items list response. A single parallel rollup request (not N requests) gives every row
its total in one round trip, merged in the client where both datasets already live. This is the only
boundary-respecting way to feed the signature meter without coupling the two modules.

**Alternatives**: *Add `loggedSeconds` to the work-items list payload* — rejected: forces work-items to read
`time_logs` (boundary violation). *Per-row fetch* — rejected: N+1. *A shared read-model view owned by
neither module* — rejected: heavier than a rollup endpoint for the same result.

---

### D12 — MCP parity stays 49/49 by omission + comment (the M3 mechanism), no tools added

**Decision**: Add **zero** MCP tools. Keep `serviceCapabilities` in `check-mcp-parity.ts` unchanged and add
a **comment** documenting that time-tracking control is a v2 deferral (FR-TT-010 / FR-INT-MCP-008). The new
`module.testplan.ts` declares `mcpTools: []`.

**Rationale**: The codebase has **no separate "deferred-capabilities" list** — the parity gate is a
bidirectional match between `serviceCapabilities` and registered tools, and a capability is excluded simply
by **not listing it** (exactly how M3 excluded credential flows, documented by comment). Omitting time
capabilities keeps the gate green at 49/49 with no orphan tools and no uncovered capabilities, honoring the
spec's locked "no pull-forward" (FR-FIN-004).

**Alternatives**: *Register time tools now* — rejected: pulls v2 scope forward, grows the agent surface the
milestone must hold flat, and requires modeling idempotent time-control over MCP. *Invent a
`deferredCapabilities` array* — rejected: not how the existing gate works; the comment-and-omit pattern is
already established and sufficient.

---

### D13 — Idempotent / replay-safe writes via the existing `IdempotencyService`

**Decision**: Timer **stop** and **manual log** (and **start**) accept an `Idempotency-Key` header and run
through the existing `IdempotencyService.run(key, scope, fn)` (Redis `SET NX`, cached response, 409 on
in-flight duplicate). Start is **additionally** guarded by the `timers` unique constraint (D3), so a
duplicated start can never create two timers regardless of the key.

**Rationale**: FR-X-004 / SC-007 require retries to never double-count. The codebase already has the exact
mechanism M3 used; reusing it means a retried stop returns the same finalized `time_log` rather than
creating a second one.

**Alternatives**: *Bespoke dedup table* — rejected: re-implements `IdempotencyService`. *No idempotency*
— rejected: violates the architecture invariant and SC-007.

---

### D14 — Entry source is its own enum, distinct from work-item capture source

**Decision**: `time_logs.source` is a **new** `timeEntrySourceEnum` (`TIMER` | `MANUAL` | `SLACK` | `MCP` |
`API`). For M2 only `TIMER` and `MANUAL` are produced; `SLACK`/`MCP`/`API` exist for forward-compat with
the v2 time channels (FR-TT-004). The M3 `work_items.source` capture enum (`WEB`/`SLACK`/`MCP`/`API`) is
**unchanged and untouched**: a time entry's source and the item's capture source are **distinct, both
correct, read consistently** (FR-FIN-002).

**Rationale**: The two provenances answer different questions ("how was this time logged?" vs "how was this
item captured?") and share only the channel sub-vocabulary. A separate enum keeps `TIMER`/`MANUAL` (which
make no sense for capture) and `WEB` (which makes no sense for a time entry) from leaking across. The shared
`SLACK`/`MCP`/`API` words satisfy the spec's "source vocabulary is shared" without conflating the columns.

**Alternatives**: *Reuse `captureSourceEnum` for time* — rejected: it lacks `TIMER`/`MANUAL` and carries
`WEB`; overloading it would muddy both meanings and the FR-FIN-002 distinctness requirement.

---

### D15 — Item deletion & retention: logs persist on soft-delete, excluded from aggregation; cascade on purge

**Decision**: `time_logs.work_item_id` (and `timers.work_item_id`) reference `work_items` with
`onDelete: cascade`. Because items **soft-delete** (`deleted_at`), normal deletion leaves `time_logs`
intact but **aggregations and the meter exclude entries whose item is soft-deleted** (join + `deleted_at IS
NULL`). A hard purge cascades the logs and any running timer away.

**Rationale**: The Edge Cases require "entries are handled with the item per the data-retention rule" and
"aggregations stop counting the removed time." Soft-delete + aggregation filter delivers exactly that while
keeping the data recoverable (consistent with the M1 soft-delete/restore model); cascade-on-purge prevents
orphans when an item is truly removed.

**Alternatives**: *Hard-delete logs on item soft-delete* — rejected: loses recoverable history and
contradicts the soft-delete model. *Keep counting soft-deleted items* — rejected: the spec says stop
counting.

---

### D16 — No new entrypoint, no time queue: time writes are synchronous request-path work

**Decision**: All time writes (start/stop/log/edit/delete) run **synchronously** in the request path; no
BullMQ queue and **no new image entrypoint** are added.

**Rationale**: Unlike M3's Slack webhook (a 3 s-ack constraint forcing async), time operations are
direct, fast, single-row writes with no external-callback timing pressure. Principle VII is best served by
**not** adding a queue/entrypoint that brings nothing. (Future Slack/MCP time-*control*, v2, may enqueue;
M2 does not need it.)

**Alternatives**: *Process stops via a queue* — rejected: needless latency and operational surface for a
sub-300 ms DB write.

---

### D17 — Web: one new token-only `<Meter>` primitive reusing the already-defined time tokens

**Decision**: Build a single `<Meter>` component in `packages/ui` (`meter.tsx` + `meter.module.css`) that
fills with `--time-actual` (honey) toward a `--time-plan` planned tick on a `--time-track-bg` track, and
switches to `--time-over` (red) past the estimate. Durations render through the existing `<Figure>`
(Geist-Mono `tabular-nums`). **No new design token** is introduced — the time tokens already exist in
`branding/colors_and_type.css`. The meter is reused in the Board card, the List row, and item detail;
item detail adds timer controls + an entries list; "my time" sits beside My Work.

**Rationale**: Principle VIII mandates token-only UI from one source; the branding bundle **already
defines** `--time-plan`/`--time-actual`/`--time-over`/`--time-track-bg` and the time type scale precisely
for this signature move, so the work is to *consume* them, not invent. A shared primitive keeps every
surface visually identical and keeps `check-design-tokens` green.

**Alternatives**: *Inline per-surface meter markup* — rejected: duplicates brand logic and risks drift.
*New tokens for the meter* — rejected: the tokens exist; adding more would violate the single-source rule.

---

## Resolved unknowns (summary)

| Topic | Resolution |
|---|---|
| Module shape | New bounded module mirroring `work-items` (D1) |
| Tables | `timers` + `time_logs` (D2) |
| One-active invariant | `UNIQUE(organization_id, user_id)` on `timers` (D3) |
| Timer truth / persistence | Server `started_at` via `CLOCK`; client derives elapsed; no realtime (D4) |
| Duration unit / estimate unit | Integer seconds; estimate reused as hours (D5) |
| Planned vs interruption | Derived-once snapshot, override flag, sums to total (D6) |
| Audit + feed | Reuse `activity` (+5 `TIME_*` actions); no new table (D7) |
| Cross-module append | `work-items` contract `recordTime*` (the `comments` pattern) (D8) |
| RBAC | Reuse `work:read`/`work:write`; owner-or-admin in provider (D9) |
| Aggregation | Query-only `SUM … GROUP BY`; no rollup table (D10) |
| Row-meter data | Parallel `/time/rollup`, merged client-side (D11) |
| MCP parity | 49/49 by omission + comment; `mcpTools: []` (D12) |
| Idempotency | Existing `IdempotencyService` + unique constraint (D13) |
| Entry source | New `timeEntrySourceEnum`, distinct from capture source (D14) |
| Retention on delete | Soft-delete persists, excluded from aggregation; cascade on purge (D15) |
| Entrypoint/queue | None — synchronous request-path writes (D16) |
| Web meter | One token-only `<Meter>` reusing existing time tokens (D17) |

**No `NEEDS CLARIFICATION` remain.** The two light-touch items the spec flagged (the exact
planned-vs-interruption default rule; item-deletion behavior for time logs) are resolved in D6 and D15.
