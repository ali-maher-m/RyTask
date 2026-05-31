# Phase 1 Data Model: Core Work Loop (M1)

**Feature**: `001-core-work-loop` · **Date**: 2026-05-31 · **Source of truth**:
`packages/db/src/tables.ts` (Drizzle). This document specifies the M1 additions; the scaffold already
ships the tenancy spine (`organizations`, `workspaces`, `users`).

**Conventions** (mirrors the existing `tables.ts`): UUIDv7 primary keys generated app-side
(`primaryId()`), `timestamptz` timestamps via the shared `timestamps` spread, every tenant-scoped
table carries `organization_id NOT NULL` with a composite index **leading on `organization_id`**
(ADR-002), `references(..., { onDelete: ... })`, index arrays returned as `(t) => [ ... ]`. Enums live
in `packages/db/src/enums.ts` (new). Soft-delete (`deleted_at`) only where recovery is required
(Principle / Additional Constraints).

> Tenancy invariant (Principle II): **every** table below has `organization_id`. Workspace-scoped
> rows also carry `workspace_id`. Reads go through `TenantScopedRepository`, which injects
> `WHERE organization_id = :orgId`. Cross-tenant isolation is asserted per table (FR-TEN-003, SC-014).

---

## 1. Enums (`packages/db/src/enums.ts`)

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

// FR-PRIO-001 — fixed scale, ordered URGENT→NONE (ordinal drives sort/grouping, FR-PRIO-002).
export const priorityEnum = pgEnum('priority', ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);

// FR-WF-002 — status *category* is fixed; status *rows* are customizable per project (ADR-004).
export const statusCategoryEnum = pgEnum('status_category', [
  'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELLED',
]);

// Project membership role (M1 subset; org roles come from M0). Governs who can act on a project.
export const projectRoleEnum = pgEnum('project_role', ['ADMIN', 'MEMBER', 'VIEWER']);

// FR-VIEW-001/002 — saved view surface kinds for M1.
export const viewKindEnum = pgEnum('view_kind', ['BOARD', 'LIST']);

// FR-VIEW-008 — saved-view visibility.
export const viewScopeEnum = pgEnum('view_scope', ['PERSONAL', 'SHARED']);

// FR-NOTIF-001 — notification event types delivered to the inbox in M1.
export const notificationTypeEnum = pgEnum('notification_type', [
  'ASSIGNED', 'MENTIONED', 'COMMENTED', 'STATUS_CHANGED', 'DUE_SOON', 'OVERDUE',
]);

// FR-WI-009 — per-item activity actions.
export const activityActionEnum = pgEnum('activity_action', [
  'CREATED', 'UPDATED', 'STATUS_CHANGED', 'ASSIGNED', 'MOVED', 'DELETED', 'RESTORED',
  'COMMENTED', 'SUBTASK_ADDED', 'LABEL_ADDED', 'LABEL_REMOVED',
]);

// Why a user watches an item (drives notification fan-out + mention context access, D9).
export const watcherReasonEnum = pgEnum('watcher_reason', [
  'ASSIGNEE', 'AUTHOR', 'MENTIONED', 'MANUAL',
]);
```

---

## 2. Entities

### 2.1 `projects` (FR-PROJ-001)

A container for work items; owns its statuses, key prefix, membership, and key sequence.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `organization_id` | uuid NOT NULL → organizations | tenant scope |
| `workspace_id` | uuid NOT NULL → workspaces | |
| `name` | text NOT NULL | |
| `key_prefix` | text NOT NULL | the `RY` in `RY-142` (FR-WI-002); uppercase, unique per workspace |
| `description` | text | |
| `icon` | text | emoji/name |
| `color` | text NOT NULL default `#6B7280` | |
| `lead_id` | uuid → users (null) | project lead |
| `archived_at` | timestamptz (null) | archived hidden from default lists, retained (FR-PROJ-001) |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(organization_id, workspace_id)`; **unique** `(organization_id, workspace_id, key_prefix)`.
Validation: `key_prefix` matches `^[A-Z][A-Z0-9]{1,9}$`; `name` 1–120 chars.
States: active → archived (`archived_at` set) → restored (cleared); delete is hard with cascade
(M1 keeps delete behind ADMIN, see RBAC matrix).

```ts
export const projects = pgTable('projects', {
  id: primaryId(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyPrefix: text('key_prefix').notNull(),
  description: text('description'),
  icon: text('icon'),
  color: text('color').notNull().default('#6B7280'),
  leadId: uuid('lead_id').references(() => users.id, { onDelete: 'set null' }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  index('projects_org_ws_idx').on(t.organizationId, t.workspaceId),
  uniqueIndex('projects_org_ws_prefix_unique').on(t.organizationId, t.workspaceId, t.keyPrefix),
]);
```

### 2.2 `project_members` (FR-PROJ-002)

Governs access: only members (or org admins from M0) may act on a project.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `project_id` | uuid NOT NULL → projects (cascade) | |
| `user_id` | uuid NOT NULL → users | |
| `role` | `project_role` NOT NULL default `MEMBER` | ADMIN/MEMBER/VIEWER |
| `created_at` | timestamptz | |

Indexes: `(organization_id, project_id)`; **unique** `(project_id, user_id)`; `(organization_id, user_id)`
(for "projects I can access" / My Work). Non-member read/write → `403` (US4 AC2).

### 2.3 `project_counters` (FR-WI-002, research D1)

Atomic per-project key sequence; keys never recycled.

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid PK → projects (cascade) | one row per project |
| `organization_id` | uuid NOT NULL | |
| `last_number` | integer NOT NULL default 0 | minted via `UPDATE … SET last_number = last_number + 1 RETURNING last_number` inside the create tx |

Seeded (row inserted) when a project is created. The mint runs in the same transaction as the work-item
insert so a rolled-back create never burns a number unnecessarily, and a committed delete never
decrements (no recycling).

### 2.4 `statuses` (FR-WF-001/002, ADR-004)

Per-project, customizable, mapped to a fixed category.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `project_id` | uuid NOT NULL → projects (cascade) | |
| `name` | text NOT NULL | "To Do", "Blocked", … |
| `category` | `status_category` NOT NULL | BACKLOG/UNSTARTED/STARTED/COMPLETED/CANCELLED |
| `color` | text NOT NULL default `#6B7280` | |
| `position` | integer NOT NULL | board column order |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(organization_id, project_id)`; unique `(project_id, name)`.
Seed on project create (FR-WF-001): To Do (UNSTARTED), In Progress (STARTED), Review (STARTED),
Done (COMPLETED), Backlog (BACKLOG), Cancelled (CANCELLED).
**Delete rule (FR-WF-002, Edge Case)**: deleting a status that has items requires a `reassignTo`
status id; the provider re-maps items in one transaction. A project must always retain ≥1 status.

### 2.5 `work_items` (the core — FR-WI-001/002/003)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | UUIDv7 |
| `organization_id` | uuid NOT NULL → organizations | tenant scope |
| `workspace_id` | uuid NOT NULL → workspaces | |
| `project_id` | uuid NOT NULL → projects | |
| `number` | integer NOT NULL | human ref (`{prefix}-{number}`), stable, never recycled (FR-WI-002) |
| `title` | text NOT NULL | only required field (FR-WI-001) |
| `description` | text | markdown (FR-WI-006, D15) |
| `status_id` | uuid NOT NULL → statuses | default = project's first UNSTARTED ("To Do") |
| `priority` | `priority` NOT NULL default `NONE` | FR-PRIO-001 |
| `assignee_id` | uuid → users (null) | **single** assignee in M1 (spec Assumptions; junction deferred) |
| `reporter_id` | uuid → users (null) | creator |
| `parent_id` | uuid → work_items (null, self-ref) | sub-tasks, ≥3 levels, cycle-checked (FR-HIER-001, D4) |
| `estimate_value` | numeric (null) | simple numeric in M1 (spec Assumptions) |
| `start_date` | date (null) | FR-DATE-002 (range start) |
| `end_date` | date (null) | FR-DATE-002 (range end) |
| `due_date` | date (null) | FR-DATE-001 (independent of range) |
| `position` | numeric (null) | fractional board rank (D13) |
| `version` | integer NOT NULL default 0 | optimistic concurrency (D13) |
| `completed_at` | timestamptz (null) | set when moved to a COMPLETED-category status |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz (null) | soft-delete/trash (FR-WI-008, D12) |

Indexes:
- `(organization_id, project_id, status_id)` — hot board/list query (`wi_org_proj_status_idx`).
- **unique** `(organization_id, project_id, number)` — key uniqueness (`wi_org_proj_number_unique`).
- `(organization_id, due_date)` — Due Soon / Overdue (`wi_org_due_idx`).
- `(organization_id, assignee_id)` — My Work / My Issues (`wi_org_assignee_idx`).
- `(organization_id, parent_id)` — children lookup.
- generated `search_vector tsvector` (title weight A, description weight B) + **GIN** (`wi_search_gin`, D8).

Validation (DTO + domain): `title` 1–500 chars after quick-add token stripping; `parent_id` must be in
the same project and pass the cycle/depth policy; `status_id` must belong to `project_id`;
`assignee_id` must be a project member; setting a COMPLETED-category status sets `completed_at`, moving
out clears it.

State transitions:
```
create → (status = first UNSTARTED) → move(status) … → COMPLETED (completed_at set)
                                              │
                                         delete → trash (deleted_at) → restore (deleted_at = null)
                                                                      → purge (hard delete, retention job)
```

```ts
export const workItems = pgTable('work_items', {
  id: primaryId(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  statusId: uuid('status_id').notNull().references(() => statuses.id),
  priority: priorityEnum('priority').notNull().default('NONE'),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  parentId: uuid('parent_id'),
  estimateValue: numeric('estimate_value'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  dueDate: date('due_date'),
  position: numeric('position'),
  version: integer('version').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('wi_org_proj_status_idx').on(t.organizationId, t.projectId, t.statusId),
  uniqueIndex('wi_org_proj_number_unique').on(t.organizationId, t.projectId, t.number),
  index('wi_org_due_idx').on(t.organizationId, t.dueDate),
  index('wi_org_assignee_idx').on(t.organizationId, t.assigneeId),
  index('wi_org_parent_idx').on(t.organizationId, t.parentId),
]);
// NOTE: parent_id self-FK + the generated search_vector column + GIN index are added in the
// migration (Drizzle self-references and generated tsvector columns are declared post-table).
```

### 2.6 `labels` + `work_item_labels` (FR-LBL-001, D14)

`labels` (workspace-scoped): `id`, `organization_id`, `workspace_id` → workspaces, `name`, `color`
(default `#3B82F6`), timestamps. Unique `(workspace_id, lower(name))`; index `(organization_id, workspace_id)`.

`work_item_labels` (junction): `work_item_id` → work_items (cascade), `label_id` → labels (cascade),
`organization_id`. PK `(work_item_id, label_id)`; index `(organization_id, label_id)` for "filter by
label".

### 2.7 `comments` (FR-COLLAB-001/002, D9)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `work_item_id` | uuid NOT NULL → work_items (cascade) | |
| `author_id` | uuid NOT NULL → users | |
| `parent_id` | uuid → comments (null, self-ref) | threading |
| `body` | text NOT NULL | markdown; @mentions parsed (D9/D15) |
| `created_at` / `updated_at` | timestamptz | |
| `edited_at` | timestamptz (null) | |
| `deleted_at` | timestamptz (null) | soft-delete |

Indexes: `(organization_id, work_item_id)`; `(organization_id, parent_id)`. Body 1–10,000 chars.
Generated `search_vector` + GIN for comment search (D8).

### 2.8 `work_item_watchers` (D9)

Drives notification fan-out and mention-granted context access.

| Column | Type | Notes |
|---|---|---|
| `organization_id` | uuid NOT NULL | |
| `work_item_id` | uuid NOT NULL → work_items (cascade) | |
| `user_id` | uuid NOT NULL → users | |
| `reason` | `watcher_reason` NOT NULL | ASSIGNEE/AUTHOR/MENTIONED/MANUAL |
| `created_at` | timestamptz | |

PK `(work_item_id, user_id)`; index `(organization_id, user_id)`. A `MENTIONED` row grants the
mentioned user read access to the item even without project membership (FR-COLLAB-002).

### 2.9 `activity` (FR-WI-009, D11) — append-only

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `work_item_id` | uuid NOT NULL → work_items (cascade) | |
| `actor_id` | uuid → users (null = system) | |
| `action` | `activity_action` NOT NULL | |
| `field` | text (null) | which field changed (for UPDATED) |
| `old_value` | jsonb (null) | |
| `new_value` | jsonb (null) | |
| `created_at` | timestamptz | |

Index `(organization_id, work_item_id, created_at)`. **No update/delete path** (immutable). One row per
changed field, written in the same transaction as the mutation.

### 2.10 `views` (FR-VIEW-008, D6/D7) — saved views

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `project_id` | uuid → projects (null = cross-project) | |
| `owner_id` | uuid NOT NULL → users | |
| `name` | text NOT NULL | |
| `kind` | `view_kind` NOT NULL | BOARD / LIST |
| `scope` | `view_scope` NOT NULL default `PERSONAL` | PERSONAL / SHARED (FR-VIEW-008) |
| `filters` | jsonb NOT NULL default `{}` | filter AST (D6) |
| `grouping` | jsonb (null) | `{ field }` |
| `sort` | jsonb NOT NULL default `[]` | ordered `[{ field, dir }]` (multi-key, FR-VIEW-007) |
| `layout` | jsonb (null) | column/visibility prefs |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(organization_id, project_id)`; `(organization_id, owner_id)`. PERSONAL views are visible
only to `owner_id`; SHARED views to project members. **Smart views (My Issues, Due Soon, Overdue,
Urgent) and My Work are NOT rows** — they are code-defined ASTs (D7).

### 2.11 `notifications` (FR-NOTIF-001/002, D10)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `recipient_id` | uuid NOT NULL → users | |
| `type` | `notification_type` NOT NULL | |
| `entity_type` | text NOT NULL | e.g. `work_item`, `comment` |
| `entity_id` | uuid NOT NULL | |
| `actor_id` | uuid → users (null) | who triggered it (never == recipient) |
| `payload` | jsonb NOT NULL default `{}` | title/key snapshot for inbox rendering |
| `dedupe_key` | text NOT NULL | hash(recipient, entity, type, bucket) — **unique** (exactly-once) |
| `read_at` | timestamptz (null) | |
| `snoozed_until` | timestamptz (null) | re-surfaces after this time |
| `archived_at` | timestamptz (null) | |
| `created_at` | timestamptz | |

Indexes: `(organization_id, recipient_id, created_at)` — inbox list; **unique** `(dedupe_key)` —
de-duplication backstop (SC-010); partial index on `(recipient_id) WHERE read_at IS NULL` for the
unread count.

---

## 3. Relationships (M1 ER sketch)

```
organizations 1─* workspaces 1─* projects 1─┬─* project_members ─* users
                                            ├─1 project_counters
                                            ├─* statuses
                                            ├─* views
                                            └─* work_items ─┬─* work_item_labels *─ labels (workspace-scoped)
                                                            ├─* comments (threaded, self-ref)
                                                            ├─* work_item_watchers *─ users
                                                            ├─* activity (append-only)
                                                            ├─* work_items (parent_id self-ref, sub-tasks)
                                                            └─ assignee_id / reporter_id → users
organizations 1─* notifications ─ recipient → users
```

---

## 4. Module ownership (bounded contexts, Principle III)

| Table(s) | Owning module |
|---|---|
| `projects`, `project_members`, `project_counters`, `statuses` | `projects` |
| `work_items`, `labels`, `work_item_labels`, `work_item_watchers`, `activity` | `work-items` |
| `comments` | `comments` |
| `views` | `views` |
| `notifications` | `notifications` |
| (read-only over work_items + comments tsvectors) | `search` |

Cross-module access goes through the owning module's `*.contract.ts` service or domain events — never
another module's repository (enforced by the dependency-cruiser boundary rule already in the scaffold).

---

## 5. Tenancy & test obligations per table (FR-TEN-003, SC-014)

Every table in §2 is tenant-scoped and therefore requires a **tenancy-isolation test** (org A cannot
read/write org B) declared in the owning module's `module.testplan.ts` (`kind: 'tenancy'`). Every
repository extends `TenantScopedRepository`; **no raw Drizzle access** outside repositories
(architecture-boundary gate). The default read for `work_items`/`comments` excludes
`deleted_at IS NOT NULL` unless a Trash view opts in (D12).

## 6. Migration notes

- Add `packages/db/src/enums.ts`; import enums into `tables.ts`; extend the exported `schema` map and
  `$inferSelect/$inferInsert` type exports for each new table (matching the current file's pattern).
- The `work_items.parent_id` self-FK, `comments.parent_id` self-FK, and the generated
  `search_vector` columns + GIN indexes are emitted in the generated SQL migration (Drizzle declares
  self-references and `GENERATED ALWAYS AS (to_tsvector(...)) STORED` columns at the SQL layer).
- Generate with `drizzle-kit generate` (transactional `drizzle-kit migrate`; never `db:push` in prod).
- Extend `packages/db/src/seed.ts` so `docker compose up` yields a default org/workspace/project with
  the seeded statuses and a few items (deterministic UUIDv7 namespace + fixed clock, §14.4) so US1/US2
  are demonstrable immediately and the e2e/Albert-Marissa check has data.
