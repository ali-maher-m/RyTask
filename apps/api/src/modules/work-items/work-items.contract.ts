/**
 * Public surface of the work-items module (Principle III). Other modules (comments,
 * notifications) depend ONLY on this file — never on work-items' repositories/providers.
 * `work_item_watchers` and `activity` are owned by work-items (data-model §4), so the
 * comments/notifications modules write/read them exclusively through this port (the
 * dependency-cruiser `no-cross-module-internals` rule exempts `*.contract.ts`).
 *
 * The `WorkItemsModule` binds `WORK_ITEM_ACCESS` to its injectable impl and exports the
 * token; consumers inject it by token and import `WorkItemsModule`.
 */

/**
 * Re-exported mention parser (domain/markdown.ts). The comments module parses
 * @mentions from a comment body via this contract (never by importing work-items'
 * `domain/` directly — Principle III).
 */
export { extractMentions } from './domain/markdown';

/** Why a user watches an item (mirrors the `watcher_reason` enum). */
export type WatcherReason = 'ASSIGNEE' | 'AUTHOR' | 'MENTIONED' | 'MANUAL';

/** A watcher of a work item (who to notify / who may see it via a mention). */
export interface Watcher {
  userId: string;
  reason: WatcherReason;
}

/** DI token for the cross-module work-item access port (watchers + activity + access). */
export const WORK_ITEM_ACCESS = Symbol('WORK_ITEM_ACCESS');

/** DI token for the cross-module capture port (Slack/edge create — one brain everywhere). */
export const WORK_ITEM_CAPTURE = Symbol('WORK_ITEM_CAPTURE');

/**
 * Cross-module capture surface (M3, research D1/D5). The Slack bounded module captures work items
 * through THIS port — never by importing `WorkItemsService` (Principle III; the dependency-cruiser
 * `no-cross-module-internals` rule exempts `*.contract.ts`). It is the SAME `create` the web/REST
 * path uses — one brain everywhere — so a Slack task is created by exactly the code a web task is
 * (the quick-add grammar, project defaults, activity + `source` provenance are all shared).
 */
export interface WorkItemCaptureService {
  create(
    input: import('@rytask/contracts').CreateWorkItemInput,
  ): Promise<import('@rytask/contracts').CreateWorkItemResponse>;
}

/**
 * Cross-module access to a work item's watchers, activity feed, and mention-granted
 * read access. Lets the comments module seed MENTIONED watchers and append COMMENTED
 * activity, and lets notifications fan out over watchers — all without reaching into
 * work-items internals.
 */
export interface WorkItemAccessService {
  /** Resolve a non-deleted item to its `{ projectId, assigneeId, reporterId, title, key }`, or null. */
  getItemContext(workItemId: string): Promise<WorkItemContext | null>;
  /** Resolve `@handle`s (name / email local-part) to project-member user ids, in first-seen order. */
  resolveMentions(handles: string[], projectId: string): Promise<string[]>;
  /** Seed MENTIONED watcher rows (idempotent). Granting read access via the mention (FR-COLLAB-002). */
  addMentionWatchers(workItemId: string, userIds: string[]): Promise<void>;
  /** All watchers of an item (assignee/author/mentioned/manual). */
  listWatchers(workItemId: string): Promise<Watcher[]>;
  /** True if the user may read the item — a member (any role) OR a MENTIONED watcher (FR-COLLAB-002). */
  canAccess(workItemId: string, userId: string): Promise<boolean>;
  /** Work-item ids the user may also see via a MENTIONED watcher — the search mention-grant scope. */
  mentionGrantedItemIds(userId: string): Promise<string[]>;
  /** Append a COMMENTED activity row (same owning module as the item). */
  recordCommented(workItemId: string, actorId: string | null): Promise<void>;
  /**
   * Append the M2 time events to the item's activity feed (FR-FIN-001, activity-and-source.md §1.2).
   * `activity` is owned by work-items; the time-tracking module appends through THESE methods (the
   * exact `recordCommented` pattern) — never by touching `ActivityRepository`. Synchronous with the
   * time write, so the audit row never diverges from the data. Each records `new`/`old` JSON (§1.3).
   */
  recordTimeStarted(workItemId: string, actorId: string | null, startedAt: string): Promise<void>;
  recordTimeStopped(
    workItemId: string,
    actorId: string | null,
    durationSeconds: number,
  ): Promise<void>;
  recordTimeLogged(
    workItemId: string,
    actorId: string | null,
    durationSeconds: number,
  ): Promise<void>;
  /** Edit audit (incl. classification override): who-changed-what (FR-TT-003). */
  recordTimeEdited(
    workItemId: string,
    actorId: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void>;
  recordTimeDeleted(workItemId: string, actorId: string | null, before: unknown): Promise<void>;
  /**
   * SYSTEM read-model for the due-soon/overdue notification scan (FR-NOTIF-001): every non-deleted,
   * non-completed item with a due date on or before `today + soonDays`, across ALL tenants (the
   * scheduled scan runs outside any request). The caller re-scopes per `organizationId` when it
   * dispatches, so tenant isolation holds at write time.
   */
  listDueAndOverdue(today: string, soonDays: number): Promise<DueWorkItem[]>;
  /**
   * The subject's "completed that week" list (M4 reporting US3, research D6). Non-deleted items
   * **assigned to** `userId` whose `completed_at` falls in the inclusive `[from, to]` calendar window
   * (UTC `YYYY-MM-DD`), restricted to `projectIds` (a NON-EMPTY readable-project list; `null` = no
   * project restriction). A pure work-item lifecycle read with ZERO `time_logs` involvement — the
   * `listDueAndOverdue` precedent — so it lives behind this port, not in a time-tracking join. The
   * weekly-summary provider composes it with the tracked-time totals; it stays tenant-scoped.
   */
  listCompletedForUser(
    userId: string,
    from: string,
    to: string,
    projectIds: string[] | null,
  ): Promise<import('@rytask/contracts').CompletedItemRow[]>;
}

/** A due-soon/overdue item surfaced by the scheduled scan (FR-NOTIF-001). */
export interface DueWorkItem {
  organizationId: string;
  workItemId: string;
  assigneeId: string | null;
  /** ISO `YYYY-MM-DD`. */
  dueDate: string;
  title: string;
  key: string;
  kind: 'DUE_SOON' | 'OVERDUE';
}

/** Minimal item context the collaboration modules need (no internal row shape leaked). */
export interface WorkItemContext {
  id: string;
  /** The item's workspace — time-tracking needs it to insert tenant-scoped `timers`/`time_logs` (M2). */
  workspaceId: string;
  projectId: string;
  assigneeId: string | null;
  reporterId: string | null;
  title: string;
  key: string;
  /**
   * The item's priority — the deterministic baseline for a time entry's planned-vs-interruption
   * class (`URGENT ⇒ INTERRUPTION`, else `PLANNED`; M2 US5, research D6). Snapshotted onto the
   * `time_log` at creation, so a later priority change never re-splits history.
   */
  priority: import('@rytask/contracts').Priority;
}
