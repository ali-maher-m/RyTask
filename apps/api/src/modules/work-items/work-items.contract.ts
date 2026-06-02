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
   * SYSTEM read-model for the due-soon/overdue notification scan (FR-NOTIF-001): every non-deleted,
   * non-completed item with a due date on or before `today + soonDays`, across ALL tenants (the
   * scheduled scan runs outside any request). The caller re-scopes per `organizationId` when it
   * dispatches, so tenant isolation holds at write time.
   */
  listDueAndOverdue(today: string, soonDays: number): Promise<DueWorkItem[]>;
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
  projectId: string;
  assigneeId: string | null;
  reporterId: string | null;
  title: string;
  key: string;
}
