# Phase 0 Research: Core Work Loop (M1)

**Feature**: `001-core-work-loop` · **Date**: 2026-05-31 · **Spec**: [spec.md](./spec.md)

This document resolves the open technical questions for M1 and records the decisions that
`data-model.md`, `contracts/`, and `tasks.md` build on. Every decision is traced to a spec
requirement (`FR-*`), a constitution principle (Principle I–VII), and/or an ADR in
`knowledge/ARCHITECTURE.md` §17. Decisions follow the **Decision / Rationale / Alternatives** form.

The repository is **no longer pre-code**: a green walking-skeleton scaffold exists
(`apps/{api,web}`, `packages/{db,contracts,config,ui,sdk}`, `scripts/`, `infra/`). M1 extends it
rather than starting fresh. Mirror the conventions already proven there (see
`apps/api/src/modules/health/` and `packages/db/src/tables.ts`).

---

## D0. Precondition — M1 depends on M0 (auth, RBAC, tenant resolution)

**Decision**: Treat **M0 (Foundation)** as a hard prerequisite for M1 to be *mergeable*, and design
M1 to consume the M0 seams. The current scaffold ships `AuthGuard`, `TenantGuard`, and `RbacGuard`
as **pass-through stubs** (`apps/api/src/common/guards/*.ts`) and `TenantContextService` +
`TenantScopedRepository` as working infrastructure. M1 code is written against the *intended*
behaviour (org resolved server-side into `AsyncLocalStorage`; role/permission enforced per route),
and the M1 tenancy-isolation and RBAC contract tests are authored now. They will only pass once M0
populates the guards.

**Rationale**: The spec's Assumptions state "Identity, authentication, RBAC, and onboarding exist
from a prior milestone (M0)." Principle II (tenant resolved server-side from the principal) and
Principle VI (RBAC guard on every endpoint) cannot be *satisfied* by stubs. Authoring M1 against the
real seams keeps the design honest and surfaces the dependency instead of hiding it behind
always-`true` guards.

**Alternatives considered**:
- *Build auth inside M1* — rejected; expands M1 well beyond its scope and duplicates M0.
- *Ship M1 on the pass-through stubs* — rejected; the tenancy-isolation tests (FR-TEN-003, SC-014)
  and RBAC tests (FR-PROJ-002) would be vacuously green, violating Principle V's intent.

**Action for `plan.md`**: list M0 as an explicit upstream dependency; the M1 Constitution Check
records it under Principle VI as "satisfied by M0, verified by M1 tests".

---

## D1. Per-project human keys (`RY-142`), sequential and never recycled

**Decision**: The key prefix lives on the **project** (the `RY` in `RY-142`), and each project owns
a monotonic counter in a dedicated `project_counters` table (`project_id → last_number`). Minting a
key happens inside the work-item create transaction via an atomic
`UPDATE project_counters SET last_number = last_number + 1 ... RETURNING last_number`. The work item
stores the integer `number`; the display key is derived as `${project.keyPrefix}-${number}`. A
unique index on `(organization_id, project_id, number)` guarantees uniqueness; because the counter
only ever increments and is never decremented on delete, **keys are never recycled** (FR-WI-002,
SC-003).

**Rationale**: An atomic `UPDATE ... RETURNING` under the row lock of a single counter row is
race-free under concurrency without a global advisory lock, and survives soft-delete/restore because
`number` is immutable on the item. This refines ARCHITECTURE §5 (which sketched the prefix at the
*workspace* level with `(organization_id, workspace_id, number)`); **the M1 spec puts the prefix and
sequence on the project**, so M1 is project-scoped. Cross-project move keeps the original key stable
(Edge Case "Cross-project move").

**Alternatives considered**:
- *One Postgres `SEQUENCE` per project* — rejected; thousands of sequences are an ops/DDL burden and
  do not roll back with the transaction cleanly.
- *`max(number)+1` at insert* — rejected; racy under concurrent capture, and recycles numbers after
  the highest item is deleted.
- *Counter column on `projects`* — workable, but a separate `project_counters` table keeps the hot
  counter row out of the frequently-read `projects` row and avoids write contention on project reads.

---

## D2. Quick-add inline grammar (`@assignee #label !priority ^date`)

**Decision**: Implement parsing as a **pure domain function** in
`modules/work-items/domain/quick-add.parser.ts` (no I/O) that returns a structured
`{ title, tokens: { assignees[], labels[], priority?, dueDate? }, unresolved[] }`. Resolution of
`@handle`/`#label` against members/labels happens in the `CreateWorkItemProvider` (I/O), not the
parser. Grammar (FR-WI-004):
- `@<handle|name>` → assignee candidate (resolved against project members; unresolved → flagged, not
  dropped).
- `#<label>` → label (apply existing or create per project policy, see D14).
- `!<urgent|high|medium|low|none>` → priority (case-insensitive).
- `^<date>` → due date (ISO wins; else natural language: `today`, `tomorrow`, weekday names) parsed
  in the **org timezone** (D3).
- Remaining text → title. Backslash escaping (`\@`, `\#`, `\!`, `\^`) and the rule "a token must be
  preceded by whitespace or start-of-string" allow literal `C#`, emails, `!` in titles (Edge Cases
  "Literal characters").

**Rationale**: A pure parser is trivially unit-testable at high branch coverage (Principle V,
≥90% branch on domain policies) and deterministic. Keeping resolution out of the parser preserves the
ports/adapters boundary (Principle III) and lets the same parser power the future Slack/MCP capture
paths.

**Alternatives considered**:
- *Parse during the controller/DTO layer* — rejected; couples grammar to HTTP and blocks reuse.
- *Third-party NLP date library as the primary path* — deferred; M1 ships a small deterministic
  natural-language date resolver behind a `Clock` port; exotic phrasings fall back to "no date,
  token flagged" (spec Assumptions). A richer library can slot in behind the same interface later.

---

## D3. Dual date model + overdue computation in the org timezone

**Decision**: Each work item carries three independent `date` columns: `dueDate` (FR-DATE-001),
`startDate` and `endDate` (the range, FR-DATE-002) — all nullable and independent. **Overdue is
computed, never stored**: `overdue = dueDate is not null AND dueDate < today(orgTz) AND
status.category NOT IN (COMPLETED, CANCELLED)` (FR-DATE-003). "Today" is resolved from the org's
timezone in `organizations.settings` via the `Clock` port, so the boundary case (due "today") and
the clear-on-complete case behave per the Edge Cases.

**Rationale**: Storing overdue would require a sweep to keep it correct as the clock advances and as
status changes; computing it from indexed columns (`wi_org_due_idx` on `(organization_id, due_date)`)
keeps it always-correct and feeds the Overdue/Due-Soon smart views directly. Org-tz resolution via a
port keeps the domain pure and the tests deterministic (fixed clock).

**Alternatives considered**:
- *Materialized `is_overdue` boolean + nightly job* — rejected for M1; needless infra and a
  staleness window; revisit only if a hot report demands it.

---

## D4. Sub-task hierarchy — depth + cycle prevention

**Decision**: `work_items.parent_id` is a nullable self-reference. A pure
`hierarchy.policy.ts` enforces (a) **no self-parenting**, (b) **no cycles** (the new parent must not
be a descendant of the item), and (c) **max depth ≥ 3** (configurable; default depth cap surfaced
clearly on violation). The provider loads the ancestor chain via a recursive CTE
(`WITH RECURSIVE`) to validate before writing (FR-HIER-001, Edge Case "Sub-task cycles / depth").
Parent shows a child count via a scoped `COUNT` (or a cached `childCount` updated on child
create/delete/move).

**Rationale**: Cycle detection must be a domain rule with unit tests (Principle V); the recursive CTE
is the cheapest correct ancestor walk in Postgres and stays tenant-scoped through the repository.

**Alternatives considered**:
- *Materialized path / `ltree`* — powerful but over-scoped for M1's ≥3-level requirement; adds
  migration and maintenance cost. Adjacency list + CTE is sufficient and simplest.
- *Closure table* — deferred; reconsider if deep-tree reads become hot.

---

## D5. Customizable categorized statuses + safe deletion

**Decision**: `statuses` are **rows per project** (name, color, integer `position`, and a
`category` from the fixed `status_category` enum: `BACKLOG | UNSTARTED | STARTED | COMPLETED |
CANCELLED`). New projects are seeded with To Do/In Progress/Review/Done + Backlog/Cancelled mapped to
those categories (FR-WF-001). Admins add/rename/reorder/recolor/delete (FR-WF-002). **Deleting a
status that still has items requires a `reassignTo` target status**; the delete provider re-maps
items in one transaction so no item is left dangling (Edge Case "Status deletion with items").

**Rationale**: ADR-004 — category enum keeps views/smart-views/reporting able to reason about "is
this Done?" while status *rows* stay fully customizable. Required-remap on delete preserves the
`work_items.status_id NOT NULL` invariant.

**Alternatives considered**:
- *Hard-coded status list* — rejected; violates FR-WF-002.
- *Soft-delete statuses* — rejected; leaves items pointing at hidden statuses and complicates the
  board. Explicit remap is clearer.

---

## D6. One query engine — AND/OR filters, multi-sort, grouping, keyset pagination

**Decision**: Build a single **filter/query compiler** (`modules/views/domain/filter.ast.ts` +
`query-compiler.ts`) that turns a JSON filter AST into a Drizzle `SQL` predicate, shared by List,
Board, search result narrowing, saved views, and smart views (and later reports/MCP `list_*`).
- **Filter AST**: `{ op: 'and'|'or', conditions: [ Condition | Group ] }` where a `Condition` is
  `{ field, operator, value }` over a typed field registry (status, priority, assignee, labels,
  dueDate, startDate, endDate, project, overdue, text). Operators are validated per field type
  (Principle III pure policy). This satisfies the compound example
  `priority = Urgent AND (label = bug OR overdue)` exactly (FR-VIEW-006, SC-006).
- **Sorting**: ordered list of `{ field, dir }` keys (FR-VIEW-007).
- **Pagination**: **keyset/cursor** on `(…sortKeys, id)` — opaque base64 cursor; response envelope
  `{ data, pageInfo: { nextCursor, hasNextPage } }` (ADR-005, FR-VIEW-010).
- **Grouping**: returned as a group key per row (client renders sections) plus optional per-group
  counts; priority grouping orders `URGENT→NONE` via an explicit enum ordinal.

**Rationale**: ADR-005 "one query engine for views/search/reports/API/MCP — build once, reuse."
Keyset beats `OFFSET` for the ~1,000-item responsive-scroll target (SC-011). A typed field registry
makes operator/type validation a unit-testable domain rule and prevents injection (values are always
bound parameters).

**Alternatives considered**:
- *Offset pagination* — rejected; degrades and is unstable under concurrent writes.
- *Raw SQL strings per view* — rejected; unsafe and un-reusable.
- *A general expression language (e.g., CEL)* — over-scoped; a constrained JSON AST is enough and
  serializes cleanly into saved-view rows and (later) MCP tool args.

---

## D7. Saved views (rows) vs smart views (system-computed)

**Decision**: **Saved views** persist as `views` rows (`kind` BOARD|LIST, `filters` AST, `grouping`,
`sort`, `layout`, `ownerId`, `isShared`, optional `projectId`). Default new saves to **personal**
unless explicitly shared (FR-VIEW-008, spec Assumptions). **Smart views** (My Issues, Due Soon,
Overdue, Urgent) are **not rows** — they are named, code-defined filter ASTs evaluated live against
the current principal, so they are always current (FR-VIEW-009, SC-007). "My Work" (FR-PROJ-006) is a
cross-project smart view (`assignee = me` across accessible projects, `projectId = null`).

**Rationale**: Smart views must reflect live data and the current user; storing them as rows would
require per-user materialization. Defining them as parameterized ASTs reuses the D6 engine and keeps
them DRY.

**Alternatives considered**:
- *Seed smart views as rows per user* — rejected; staleness + per-user fan-out for zero benefit.

---

## D8. Full-text search — Postgres FTS, permission-aware

**Decision**: Use **PostgreSQL native FTS** (Principle I, spec Assumptions "platform built-in
full-text"). Add a generated `tsvector` column (`search_vector`) on `work_items`
(title + description, weighted A/B) and on `comments` (body), each with a **GIN index**. Search is a
`search.service` that runs `to_tsquery`/`websearch_to_tsquery` over both, unions, ranks
(`ts_rank_cd`), and — critically — applies the **same tenant scope and project-membership filter**
as every other read, so results never cross tenants or leak inaccessible projects (FR-SRCH-001/004,
SC-009, SC-014). Projects, labels, and users are matched by trigram/`ILIKE` (small sets).

**Rationale**: Generated `tsvector` + GIN needs no separate index pipeline or job for M1 volumes and
stays transactionally consistent with the row. ADR notes a `search_documents` denormalized table +
`SEARCH_INDEX` BullMQ queue as the scale path (FR-SRCH-005) — deferred, with the seam left clean
(the `search.service` interface does not change when the backend swaps).

**Alternatives considered**:
- *External engine (Meilisearch/Elastic)* — out of M1 scope; adds a service to the one-command
  deploy (Principle VII) for no M1 benefit.
- *`search_documents` table + indexer job now* — deferred; more moving parts than M1 volumes need.

---

## D9. Comments, @mentions, watchers & context access

**Decision**: `comments` are threaded via a nullable `parent_id` self-reference, markdown `body`,
`author_id`, `work_item_id` (FR-COLLAB-001). `@mentions` are parsed from comment/description markdown
by a pure mention parser; each resolved mention (a) creates a notification and (b) inserts a
`work_item_watchers` row granting **context access** to that item (FR-COLLAB-002). `work_item_watchers`
(`work_item_id`, `user_id`, `reason`) also records assignment- and author-derived watchers and drives
who gets status-change notifications.

**Rationale**: A single `work_item_watchers` table is the join point for "who should be notified" and
"who may see this item via a mention", keeping the notification fan-out a simple scoped query.

**Alternatives considered**:
- *Derive watchers on the fly each event* — rejected; mention-granted access must persist as a row to
  be checked by the read path.

---

## D10. Notifications — event set, dedup, inbox states

**Decision**: A `notifications` table (`recipient_id`, `type`, `entity_type`, `entity_id`, `payload`
jsonb, `read_at`, `snoozed_until`, `archived_at`, plus a `dedupe_key`). The `notifications` module
consumes domain events (`WorkItemAssigned`, `UserMentioned`, `CommentAdded`,
`WorkItemStatusChanged`, `DueSoon`/`Overdue`) and produces **exactly one** inbox row per meaningful
event per recipient via a **unique `dedupe_key`** = hash of `(recipientId, entityId, eventType,
bucket)`; self-actions skip the actor (Edge Case "Self-mention / duplicate notifications",
FR-NOTIF-001, SC-010). Inbox supports read/unread, snooze (re-surface after `snoozed_until`), archive
(FR-NOTIF-002).

**Rationale**: A DB unique constraint on `dedupe_key` makes "exactly once" structural rather than
best-effort. M1 ships **in-app only** (spec Assumptions); email/Slack channels are deferred but the
event-consumer seam is identical, so adding a channel later is additive.

**Alternatives considered**:
- *Dedup in application code only* — rejected; racy under concurrent events; the unique index is the
  backstop.
- *Realtime push of the inbox* — deferred (D16); M1 inbox refreshes on navigation.

---

## D11. Activity / history log (per-item, immutable)

**Decision**: An append-only `activity` table (`work_item_id`, `actor_id`, `action`, `field`,
`old_value`, `new_value` jsonb, `created_at`). The `UpdateWorkItemProvider` diffs the persisted row
against the incoming change set and appends one entry per changed field (old→new, actor, timestamp)
within the same transaction (FR-WI-009, US2 AC3). Create/delete/restore/status-move also append
entries.

**Rationale**: Writing activity in the same transaction as the mutation guarantees the log can never
disagree with the data (Principle II/V intent). Append-only + no update path keeps it audit-grade.

**Alternatives considered**:
- *Reconstruct history from the global `audit_log`* — the org-wide audit log (ARCHITECTURE §5.2) is a
  v2+ concern and security-shaped; the per-item activity feed is a product surface and stays local to
  work-items for M1.

---

## D12. Soft-delete (trash), restore, retention purge

**Decision**: `work_items.deleted_at timestamptz` (and `comments.deleted_at`) implement trash. The
**tenant-scoped repository's default read excludes `deleted_at IS NOT NULL`**; a `Trash` view opts in.
Restore clears `deleted_at` and re-emits visibility. A scheduled `RETENTION_PURGE` BullMQ job hard-
deletes items past a configurable retention window (FR-WI-008, US2 AC4).

**Rationale**: Soft-delete only where recovery is required (Principle / Additional Constraints). The
default-exclude lives in the repository base behaviour so no provider can forget it.

**Alternatives considered**:
- *Status = "Deleted"* — rejected; conflates workflow with lifecycle and pollutes the board.

---

## D13. Board reorder — fractional position + optimistic concurrency

**Decision**: `work_items.position numeric` holds a **fractional rank**; a board drag computes a
position between neighbours and updates **one row** (ARCHITECTURE §11.1). `work_items.version integer`
provides optimistic concurrency: the move/update endpoints accept the expected version and reject
stale writes with `409` (FR-VIEW-001, US3 AC2). A periodic rebalance is unnecessary at M1 scale but
noted.

**Rationale**: One-row updates keep drag latency low and the activity log minimal; fractional ranking
avoids re-indexing a column.

**Alternatives considered**:
- *Integer positions with shift-on-insert* — rejected; O(N) writes per drag.

---

## D14. Labels — scope & create-on-capture

**Decision**: Labels carry `name` + `color` and are **workspace-scoped** (reusable across a
workspace's projects), many-to-many with items via `work_item_labels` (FR-LBL-001). Quick-add `#label`
**applies an existing label by name (case-insensitive) within the workspace, or creates one** per a
simple project policy flag (default: create-on-capture on). Ambiguous matches are surfaced, not
guessed (Edge Case "Quick-add ambiguity").

**Rationale**: Workspace scope matches the ARCHITECTURE sketch and avoids label duplication across
projects while staying tenant-scoped.

**Alternatives considered**:
- *Project-scoped labels* — more isolation but causes duplicate "bug" labels per project; revisit if
  teams ask for it (additive — a `projectId` column can narrow scope later).

---

## D15. Markdown handling (storage, render, sanitization)

**Decision**: Store descriptions/comments as **markdown text** (the `description`/`body` columns).
Render to sanitized HTML at the **web** layer (server component) with a sanitizer allow-list;
@mentions and item-key links (`RY-142`) are resolved to links. Checklists are GitHub-flavored
markdown task lists; toggling a checkbox is a description edit that re-persists the markdown and logs
activity (FR-WI-006, US2 AC1).

**Rationale**: Markdown text is portable, diff-friendly for the activity log, and safe to expose over
the API; sanitization at render prevents stored XSS without constraining storage.

**Alternatives considered**:
- *Rich JSON (ProseMirror/Tiptap) document model* — more capable but heavier; ARCHITECTURE leaves
  "rich text (JSON/markdown)" open. M1 chooses markdown for simplicity and the Albert/Marissa test;
  a JSON model can be adopted later behind the same column.

---

## D16. Realtime scope — gateway seam now, live fan-out deferred

**Decision**: M1 **establishes the WebSocket gateway seam** (`/realtime`, JWT/PAT-authenticated,
tenant- and resource-scoped channels per ARCHITECTURE §6.7) but does **not** require live
cross-client fan-out or optimistic-collab in M1. Views and the inbox update on navigation/refresh
(spec Assumptions; FR-VIEW-012 / FR-NOTIF-005 are later). The gateway publishes nothing M1-critical;
Redis pub/sub fan-out is wired in the realtime milestone.

**Rationale**: Reconciles the build request ("WebSocket gateway for realtime") with the spec's
explicit deferral of realtime. Standing up the authenticated, scoped gateway now means the later
milestone only adds publishers, not a new surface.

**Alternatives considered**:
- *Full live sync in M1* — rejected; out of scope per the spec and expands the test matrix
  (presence, conflict, reconnection) well beyond the core loop.

---

## D17. API ↔ MCP parity reconciliation (Principle IV vs "MCP out of scope")

**Decision**: M1 keeps the **parity gate truthful** without shipping the MCP transport. For each M1
service capability, M1 (a) registers the capability id and (b) adds a matching **MCP tool
*definition*** (name + description + JSON-schema-equivalent, mapping to the same service) in
`packages/contracts/src/mcp/registry.ts`, so `scripts/check-mcp-parity.ts` passes with real 1:1
coverage. **Only the MCP transport/gateway** (the `/mcp` endpoint, PAT-scoped sessions,
`set_active_*` context) is **deferred** to the MCP milestone. This is recorded as a justified,
time-boxed deviation in `plan.md` Complexity Tracking.

**Rationale**: Principle IV requires parity to be *mechanically verified, not maintained by
discipline*. Leaving `serviceCapabilities` empty while M1 adds real capabilities would make the gate
falsely green — worse than honest deferral. Tool *definitions* are cheap (they describe the existing
service surface) and keep the contract drift-proof; wiring the transport is the only genuinely
MCP-scoped work, and it is deferred openly.

**Alternatives considered**:
- *Skip MCP entirely in M1 and leave the gate empty* — rejected; silently violates Principle IV and
  lets the surface drift before the MCP milestone even starts.
- *Ship the full MCP transport in M1* — rejected; contradicts the spec's scope boundary.

---

## D18. Enforced testing — raise coverage gates, declare per-module test plans

**Decision**: Every M1 module ships a `module.testplan.ts` (same shape as
`apps/api/src/modules/health/module.testplan.ts`) declaring required unit/integration/contract/
tenancy tests; `scripts/check-required-tests.ts` already fails the build on a missing file. M1
**raises the Vitest coverage thresholds** (off in the scaffold) to the constitution gates: ≥80% line
(server), ≥90% in `domain/` + `providers/`, ≥90% branch on domain policies (Principle V, §14.3).
Integration tests run against **real ephemeral Postgres** via the existing
`apps/api/src/common/testing/postgres.ts` testcontainers helper. The create→board→update flow gets a
Playwright e2e (US1+US3).

**Rationale**: The closed-testing system is already wired; M1's job is to populate test plans and turn
the coverage gates on so the safety net is real before feature volume grows.

**Alternatives considered**:
- *Defer raising thresholds* — rejected; the scaffold note flags thresholds as off, and shipping M1
  without them erodes Principle V immediately.

---

## Resolved unknowns summary

| Topic | Decision | Trace |
|---|---|---|
| Auth/RBAC/tenant source | M0 prerequisite; M1 consumes seams | D0, Principle VI |
| Human keys | Per-project prefix + `project_counters` atomic increment | D1, FR-WI-002 |
| Quick-add parsing | Pure domain parser; resolution in provider | D2, FR-WI-004 |
| Dates / overdue | 3 independent date cols; overdue computed in org tz | D3, FR-DATE-* |
| Hierarchy | Adjacency + recursive-CTE cycle/depth policy | D4, FR-HIER-001 |
| Statuses | Per-project rows + category enum; remap-on-delete | D5, FR-WF-* |
| Query engine | JSON filter AST → Drizzle; keyset pagination; multi-sort | D6, FR-VIEW-006/007/010 |
| Views | Saved = rows; smart/My-Work = code-defined ASTs | D7, FR-VIEW-008/009 |
| Search | Postgres FTS (generated tsvector + GIN), permission-aware | D8, FR-SRCH-* |
| Comments/mentions | Threaded; mentions → watcher row + notification | D9, FR-COLLAB-* |
| Notifications | Event-consumed; unique `dedupe_key`; inbox states | D10, FR-NOTIF-* |
| Activity log | Append-only, same-tx diff in update provider | D11, FR-WI-009 |
| Trash | `deleted_at` default-excluded in repo; purge job | D12, FR-WI-008 |
| Board reorder | Fractional `position` + `version` optimistic lock | D13, FR-VIEW-001 |
| Labels | Workspace-scoped m2m; create-on-capture | D14, FR-LBL-001 |
| Markdown | Stored as markdown; sanitized render | D15, FR-WI-006 |
| Realtime | Gateway seam only; fan-out deferred | D16, spec Assumptions |
| MCP parity | Capability + tool *definitions* now; transport deferred | D17, Principle IV |
| Testing | Per-module test plans; raise coverage gates; real PG | D18, Principle V |

**No remaining `NEEDS CLARIFICATION`** — all are resolved above or explicitly scoped out by the spec.
