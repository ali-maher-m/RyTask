# Contract: Time-tracking REST API

**Feature**: `005-time-tracking-flagship` | **Phase**: 1

The REST surface time tracking exposes. Every route carries a server-side RBAC guard; the tenant is
resolved from the principal (never client-supplied); mutations accept an optional `Idempotency-Key`. DTOs
and zod schemas live in `packages/contracts/src/time-tracking.contract.ts`; controllers in
`apps/api/src/modules/time-tracking/controllers/`. Durations are integer **seconds**; timestamps ISO
`timestamptz`; ids UUIDv7. `{ data }` = single-resource envelope, `{ data, pageInfo }` = paginated.

Endpoints map to capabilities that are **intentionally not** exposed over MCP this milestone (49/49 holds —
research D12). Contract tests (supertest) assert each route; the timer lifecycle has an integration test.

---

## DTOs (`packages/contracts/src/time-tracking.contract.ts`)

```ts
type TimeEntrySource = 'TIMER' | 'MANUAL' | 'SLACK' | 'MCP' | 'API';   // M2 produces TIMER | MANUAL
type TimeEntryClass  = 'PLANNED' | 'INTERRUPTION';

interface ActiveTimer {
  id: string;
  workItemId: string;
  startedAt: string;          // ISO; client derives live elapsed = now − startedAt
  note: string | null;
}

interface TimeLog {
  id: string;
  workItemId: string;
  projectId: string;
  userId: string | null;       // null = attribution lost (removed user)
  startedAt: string;
  endedAt: string;
  durationSeconds: number;     // integer, > 0
  note: string | null;
  billable: boolean;
  source: TimeEntrySource;     // set server-side
  classification: TimeEntryClass;
  classificationOverridden: boolean;
  createdAt: string;
  updatedAt: string;
}

// Manual entry: EITHER durationSeconds OR (startedAt + endedAt). Server derives the missing form.
interface CreateTimeLogInput {
  durationSeconds?: number;            // exclusive-or with start/end (validator)
  startedAt?: string;
  endedAt?: string;
  date?: string;                       // ISO date for a duration-only entry (defaults to today, server TZ)
  note?: string;
  billable?: boolean;
  classification?: TimeEntryClass;     // optional explicit override; else derived
}

interface UpdateTimeLogInput {
  durationSeconds?: number;
  startedAt?: string;
  endedAt?: string;
  note?: string | null;
  billable?: boolean;
  classification?: TimeEntryClass;     // sets classificationOverridden = true
}

interface ItemRollup { workItemId: string; loggedSeconds: number; }

interface TimeSummaryRow {
  key: string;                         // the group key (itemId | userId | projectId | period bucket)
  loggedSeconds: number;
  plannedSeconds: number;
  interruptionSeconds: number;         // planned + interruption === logged (SC-005)
}
```

---

## Timer routes — `apps/api/src/modules/time-tracking/controllers/timers.controller.ts`

### `POST /work-items/:workItemId/timer/start`  → start (or switch) the timer
- **RBAC**: `@RequirePermission('work:write')` + item access via the work-items contract.
- **Body**: `{ note?: string }`. **Header**: optional `Idempotency-Key`.
- **Behavior** (research D3/D4): in one transaction — if the user already has a running timer, **finalize**
  it into a `time_log` (`source = TIMER`) and delete it; then insert a new `timers` row with
  `startedAt = clock.now()`. The `UNIQUE(organization_id, user_id)` constraint guarantees no two-active
  state under concurrency (a racing second start resolves to the running timer).
- **`201`** `{ data: ActiveTimer }` (the now-running timer). Switching also returns the new timer; the
  finalized previous entry is retrievable via the entries list / activity feed.
- **Errors**: `404` item not found / cross-tenant; `403` no item access; `409` only for an in-flight
  duplicate `Idempotency-Key`.

### `POST /timers/:id/stop`  (also `POST /work-items/:workItemId/timer/stop`) → stop the running timer
- **RBAC**: `@RequirePermission('work:write')`; the timer must belong to `principal.userId`.
- **Header**: optional `Idempotency-Key` (a retried stop returns the same finalized log — research D13).
- **Behavior**: compute `durationSeconds = round(clock.now() − startedAt)`, insert the `time_log`
  (`source = TIMER`, classification derived/snapshotted), delete the `timers` row — one transaction.
  Append `TIME_STOPPED` (and the `TIME_LOGGED` of the created entry) to the item activity feed.
- **`201`** `{ data: TimeLog }`. **Errors**: `404` no active timer for this user / not owner.

### `GET /timers/active`  → the caller's active timer (zero or one)
- **RBAC**: `@RequirePermission('work:read')`.
- **`200`** `{ data: ActiveTimer | null }`. Used on page load to re-sync a running timer after reload/
  restart (the client renders live elapsed from `startedAt`).

---

## Time-log routes — `time-logs.controller.ts`

### `POST /work-items/:workItemId/time-logs`  → manual entry (US3)
- **RBAC**: `@RequirePermission('work:write')` + item access. **Header**: optional `Idempotency-Key`.
- **Body**: `CreateTimeLogInput` — **either** `durationSeconds` **or** (`startedAt` + `endedAt`); a
  duration-only entry uses `date` (default today) for `startedAt`. `source` is forced to `MANUAL`
  server-side; classification derived unless `classification` is supplied. Validated by `duration.policy`
  (end > start, `0 < duration ≤ cap`) — invalid → `400` with a friendly message, nothing persisted.
- **`201`** `{ data: TimeLog }`. Appends `TIME_LOGGED` to the activity feed.

### `GET /work-items/:workItemId/time-logs`  → entries for an item (US2/US4)
- **RBAC**: `@RequirePermission('work:read')`. **`200`** `{ data: TimeLog[], pageInfo }` (keyset, newest
  first), excluding soft-deleted. Each row carries user, date, duration, note, billable, source, class.

### `PATCH /time-logs/:id`  → edit (US4)
- **RBAC**: `@RequirePermission('work:write')` **plus** owner-or-admin (`time-edit-permission.policy`:
  `actor === log.userId || principal.isOrgAdmin`, else **`403`** default-deny — research D9).
- **Body**: `UpdateTimeLogInput`. Re-validates duration/forms; setting `classification` flips
  `classificationOverridden = true`. **`200`** `{ data: TimeLog }`; appends `TIME_EDITED {old,new}`.

### `DELETE /time-logs/:id`  → delete (US4)
- **RBAC**: `@RequirePermission('work:write')` **plus** owner-or-admin (default-deny). Soft-delete
  (`deleted_at`), recoverable. **`204`**; appends `TIME_DELETED {old}`.

---

## Aggregation routes — `time-summary.controller.ts`

### `GET /time/rollup?projectId=…`  → per-item totals for the meter (US2, research D11)
- **RBAC**: `@RequirePermission('work:read')`. Returns every accessible item's logged total in the project
  in one call (parallel to the items list; merged client-side — work-items never reads `time_logs`).
- **`200`** `{ data: ItemRollup[] }`. Excludes soft-deleted logs and items.

### `GET /time/summary?groupBy=item|user|project|period&period=day|week&from=&to=&projectId=&userId=`  → US7
- **RBAC**: `@RequirePermission('work:read')`. `groupBy` selects the rollup axis; `period` buckets by
  day/week; filters scope item/project/user/date range. With `userId = principal.userId` this is the
  "my time today / this week" view (FR-WEB-203).
- **`200`** `{ data: TimeSummaryRow[] }`. Each row: `plannedSeconds + interruptionSeconds === loggedSeconds`
  (SC-005, asserted by the reconciliation test). Every total is a pure `SUM(duration_seconds)`.

---

## Cross-cutting

- **Tenant isolation** (FR-X-001, SC-006): every query is `TenantScopedRepository`-scoped; a cross-org id
  returns `404`/empty, asserted by `timers.tenancy.spec.ts` + `time-logs.tenancy.spec.ts`.
- **Idempotency** (FR-X-004, SC-007): start/stop/manual-create wrap `IdempotencyService.run(key, scope,
  fn)`; start is additionally unique-constrained. A retry never double-counts.
- **Error envelope**: matches M0/M1 — `400` validation, `401` unauth, `403` permission/ownership, `404`
  not-found/cross-tenant, `409` conflict/idempotency-in-flight.
- **No MCP tools**: these capabilities are a documented v2 deferral; `module.testplan.ts` declares
  `mcpTools: []`; `check-mcp-parity` stays 49/49 (research D12, FR-FIN-004).
