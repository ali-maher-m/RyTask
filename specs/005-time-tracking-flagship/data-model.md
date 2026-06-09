# Data Model: Time Tracking (the flagship) — and finalizing M0→M3 (M2)

**Feature**: `005-time-tracking-flagship` | **Date**: 2026-06-08 | **Phase**: 1 (Design & Contracts)

M2 adds the smallest server state that delivers honest time: **two** new tenant-scoped tables (`timers`,
`time_logs`), **two** new enums (`timeEntrySourceEnum`, `timeEntryClassEnum`), and **five** new values on
the existing `activityActionEnum` so time events live in the M1 activity feed (no new audit table — research
D7). The M1 `work_items.estimate_value` (the plan side of the meter) and the M3 `work_items.source`
(capture provenance) are **reused and untouched**. All new tables follow the established conventions: `id`
UUIDv7 default, `timestamptz` timestamps, `organization_id` `NOT NULL` leading every composite index,
repositories extend `TenantScopedRepository`. Schema lives in `packages/db/src/tables.ts` (single source of
truth); enums in `packages/db/src/enums.ts`.

---

## 1. New enums (`packages/db/src/enums.ts`)

```ts
// M2 — how a time entry was logged (research D14). Distinct from work_items.source (capture provenance,
// WEB/SLACK/MCP/API). For M2 only TIMER and MANUAL are produced; SLACK/MCP/API reserved for the v2 time
// channels (FR-TT-004). Shares only the channel sub-vocabulary with captureSourceEnum — never reused.
export const timeEntrySourceEnum = pgEnum('time_entry_source', [
  'TIMER',
  'MANUAL',
  'SLACK',
  'MCP',
  'API',
]);

// M2 — planned vs interruption (FR-TT-006, research D6). Derived once at creation (item priority URGENT ⇒
// INTERRUPTION, else PLANNED), snapshotted, explicitly overridable. Two values so planned + interruption
// ALWAYS sum to total.
export const timeEntryClassEnum = pgEnum('time_entry_class', ['PLANNED', 'INTERRUPTION']);
```

**Amended enum** — `activityActionEnum` gains five values (append at the end; never reorder existing —
migration safety):

```ts
export const activityActionEnum = pgEnum('activity_action', [
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNED', 'MOVED', 'DELETED', 'RESTORED',
  'COMMENTED', 'SUBTASK_ADDED', 'LABEL_ADDED', 'LABEL_REMOVED',
  // M2 — time events in the existing per-item feed (FR-FIN-001, research D7).
  'TIME_STARTED', 'TIME_STOPPED', 'TIME_LOGGED', 'TIME_EDITED', 'TIME_DELETED',
]);
```

---

## 2. New persisted entities

### 2.1 `timers` — the single in-progress accrual per user (tenant-scoped)

One short-lived row **while a timer runs**. The row's mere existence means "running"; there is no `end`
here (that belongs to a finalized `time_log`). Stopping the timer deletes this row and inserts a `time_log`
in one transaction (research D2).

```ts
timers = pgTable('timers', {
  id: primaryId(),                                    // uuidv7
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  workItemId: uuid('work_item_id').notNull()
    .references(() => workItems.id, { onDelete: 'cascade' }),  // running timer dies with a purged item (D15)
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }),      // the timer's owner
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),  // server CLOCK (research D4)
  note: text('note'),                                 // optional carry-over note onto the finalized log
  ...timestamps,                                      // createdAt / updatedAt
}, (t) => [
  // THE invariant: at most one active timer per user (FR-TT-001, SC-002, research D3).
  uniqueIndex('timers_org_user_unique').on(t.organizationId, t.userId),
  index('timers_org_work_item_idx').on(t.organizationId, t.workItemId),
]);
```

**Rules**
- `organization_id` + `workspace_id` `NOT NULL`; all reads/writes via `TenantScopedRepository`.
- `UNIQUE(organization_id, user_id)` enforces one active timer per user under concurrency (research D3).
- `started_at` is set from the **`CLOCK` port** server-side; the client never supplies it.
- Elapsed time is **derived** (`now − started_at`), never stored here. Stop computes
  `duration_seconds = round(clock.now() − started_at)` and writes a `time_log`.
- No `deleted_at` — a timer is either running (row present) or finalized (row gone). It is transient state.

### 2.2 `time_logs` — a finalized time entry (tenant-scoped); the atomic unit of all aggregation

```ts
timeLogs = pgTable('time_logs', {
  id: primaryId(),                                    // uuidv7 (sortable, exposable)
  organizationId: uuid('organization_id').notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),   // denormalized for per-project rollup (D10)
  workItemId: uuid('work_item_id').notNull()
    .references(() => workItems.id, { onDelete: 'cascade' }),  // cascade on hard purge (research D15)
  userId: uuid('user_id').notNull()
    .references(() => users.id, { onDelete: 'set null' }),     // whose time (attribution); see note
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  durationSeconds: integer('duration_seconds').notNull(),       // exact; = ended − started (research D5)
  note: text('note'),
  billable: boolean('billable').notNull().default(false),       // flag only (rates/cost are v3)
  source: timeEntrySourceEnum('source').notNull(),              // TIMER | MANUAL (M2); others = v2
  classification: timeEntryClassEnum('classification').notNull(),     // PLANNED | INTERRUPTION (snapshot)
  classificationOverridden: boolean('classification_overridden').notNull().default(false),
  ...timestamps,                                      // createdAt / updatedAt
  deletedAt: timestamp('deleted_at', { withTimezone: true }),   // soft-delete (recoverable; audited)
}, (t) => [
  index('time_logs_org_work_item_idx').on(t.organizationId, t.workItemId),       // per-item rollup + meter
  index('time_logs_org_project_started_idx').on(t.organizationId, t.projectId, t.startedAt), // project/period
  index('time_logs_org_user_started_idx').on(t.organizationId, t.userId, t.startedAt),       // "my time"
]);
```

**Rules & invariants**
- `organization_id` + `workspace_id` `NOT NULL`; every read/write via `TenantScopedRepository` (FR-X-001).
- `duration_seconds` is **integer seconds**, `> 0`, validated by `duration.policy`; for a stopped timer it
  equals `round(ended_at − started_at)`; for a manual entry it is the supplied duration **or** the derived
  `ended_at − started_at` (the two forms are stored identically — research D5).
- `ended_at > started_at` always (validator); a manual duration-only entry sets `ended_at = started_at +
  duration_seconds` so the stored shape is uniform.
- `source` is set **server-side** by the path: `TIMER` from stop, `MANUAL` from the manual endpoint (the
  client never supplies `source`). Distinct from the item's capture source (FR-FIN-002, research D14).
- `classification` is derived once at creation (`classification.policy`) and snapshotted;
  `classificationOverridden` flips on explicit override (research D6). Planned + interruption reconcile to
  the total exactly (SC-005).
- `userId` uses `onDelete: 'set null'` so a removed user doesn't erase the team's logged history (the row
  remains in project/period totals); attribution then reads "unknown user." (Mirrors `work_items.reporterId`.)
- **Soft-delete**: `deleted_at` marks deletion (recoverable). Aggregations and the meter filter
  `deleted_at IS NULL` **and** the parent item not soft-deleted (research D15).
- **Edit/delete** is **owner-or-admin** (`time-edit-permission.policy`, default-deny); every change is
  recorded in the activity feed (TIME_EDITED / TIME_DELETED with old/new — research D7).
- **Idempotency**: creation from stop or manual log is replay-safe via `IdempotencyService` (research D13).

---

## 3. Reused, unchanged entities (no migration to these)

| Entity | From | Use in M2 | Change |
|---|---|---|---|
| `work_items.estimate_value` (`numeric`) | M1 | The **plan** side of the meter, interpreted as **hours** (research D5) | **None** |
| `work_items.priority` (`priorityEnum`) | M1 | Drives the default classification (`URGENT ⇒ INTERRUPTION`, D6) | **None** |
| `work_items.source` (`captureSourceEnum`) | M3 | Capture provenance; read **alongside** a log's own source, never altered (FR-FIN-002) | **None** |
| `work_items.deleted_at` | M1 | Aggregation excludes logs of soft-deleted items (D15) | **None** |
| `activity` table + `ActivityRepository` | M1 | Time events + edit/delete audit appended via the work-items contract (D7/D8) | **+5 enum values only** |
| `labels` / `work_item_labels` | M1 | Optional per-label rollup rides on M1 labels; interruption-label override where available (D6) | **None** |
| `api_tokens` (PAT) / `common/rbac` | M0 | `work:read`/`work:write` gate reused; owner-or-admin in provider (D9) | **None** |

---

## 4. Read-models (query results, not tables — research D10/D11)

These are computed on demand from `time_logs`; **no table is materialized** (report rollups are M4).

### 4.1 Per-item rollup (feeds the in-row meter — D11)
`{ workItemId, loggedSeconds }` per item in a project. Backed by
`SUM(duration_seconds) … WHERE organization_id = :org AND project_id = :proj AND deleted_at IS NULL
GROUP BY work_item_id`, joined to exclude soft-deleted items. Served by `GET /time/rollup` and merged
client-side with the items list (work-items never reads `time_logs`).

### 4.2 Time summary (US7 aggregation — D10)
Totals grouped by **item / user / project / period**, each split **planned vs interruption**, every total a
pure `SUM(duration_seconds)` so it reconciles exactly to its entries (SC-005). Served by `GET /time/summary`
with `groupBy` + period params. The "my time today/this week" view is this query scoped to
`userId = principal.userId`.

### 4.3 Active timer (US1 — D4)
`{ workItemId, startedAt, note }` for `principal.userId` (zero or one). Served by `GET /timers/active`; the
client derives live elapsed from `startedAt`.

---

## 5. State transitions

**Timer lifecycle** (research D3/D4):

```
(no timer) ──start(itemB)──▶ timers row {userId, itemB, startedAt}        [UNIQUE(org,user) holds]
   running(itemA) ──start(itemB)──▶  [one TX]  finalize A → time_log(TIMER) ; delete timer A ; insert timer B
   running ──stop──▶  finalize → time_log{duration = now − startedAt, source=TIMER, class=derive(item)} ; delete timer
   running ──reload/restart──▶ unchanged (server-persisted) ; client re-derives elapsed from startedAt
```

**Time entry lifecycle** (research D5/D6/D7):

```
create(manual | from-stop) ─▶ time_log ; activity TIME_LOGGED ; (optional) time-log.created event
edit(owner|admin)          ─▶ time_log updated ; activity TIME_EDITED {old,new}     [else default-deny]
override classification    ─▶ classification set + classificationOverridden=true ; activity TIME_EDITED
delete(owner|admin)        ─▶ deleted_at set ; activity TIME_DELETED               [else default-deny]
item soft-deleted          ─▶ logs remain but excluded from aggregation/meter (D15)
item hard-purged           ─▶ logs + any running timer cascade away (D15)
```

---

## 6. Retention & deletion rules (research D15)

- Time logs **soft-delete** (`deleted_at`), recoverable, audited (consistent with the M1 model).
- When a **work item soft-deletes**, its logs persist but are **excluded** from every aggregation and the
  meter (join on the item's `deleted_at IS NULL`). Restoring the item restores its time in totals.
- When a work item is **hard-purged**, `onDelete: cascade` removes its `time_logs` and any `timers` row.
- A **user** removal sets `time_logs.user_id = NULL` (attribution lost, totals preserved); a user's running
  `timers` row cascades away (transient state, not history).

---

## 7. Migration

One generated Drizzle migration (`packages/db/migrations/000N_*.sql`, journalled in `meta/_journal.json`):
creates `time_entry_source` + `time_entry_class` enums, **adds** the five `TIME_*` values to
`activity_action` (`ALTER TYPE … ADD VALUE`), creates `timers` and `time_logs` with their indexes
(including `timers_org_user_unique`). No backfill needed — both tables start empty; the reused M1/M3 columns
are unchanged, so existing rows are untouched (FR-FIN-003). `seed.ts` gains a demo running timer and a few
`time_logs` (fixed UUIDv7 ids in the seed range, `onConflictDoNothing`) so `make seed` yields a visible
meter for local verification.
