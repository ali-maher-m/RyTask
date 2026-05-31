import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * M1 enumerations (data-model §1). Enum *values* are fixed in code; customizable
 * surfaces (e.g. status rows) map onto a fixed `status_category` (ADR-004).
 */

// FR-PRIO-001 — fixed scale, ordered URGENT→NONE (ordinal drives sort/grouping, FR-PRIO-002).
export const priorityEnum = pgEnum('priority', ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);

// FR-WF-002 — status *category* is fixed; status *rows* are customizable per project (ADR-004).
export const statusCategoryEnum = pgEnum('status_category', [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);

// Project membership role (M1 subset; org roles come from M0).
export const projectRoleEnum = pgEnum('project_role', ['ADMIN', 'MEMBER', 'VIEWER']);

// FR-VIEW-001/002 — saved view surface kinds for M1.
export const viewKindEnum = pgEnum('view_kind', ['BOARD', 'LIST']);

// FR-VIEW-008 — saved-view visibility.
export const viewScopeEnum = pgEnum('view_scope', ['PERSONAL', 'SHARED']);

// FR-NOTIF-001 — notification event types delivered to the inbox in M1.
export const notificationTypeEnum = pgEnum('notification_type', [
  'ASSIGNED',
  'MENTIONED',
  'COMMENTED',
  'STATUS_CHANGED',
  'DUE_SOON',
  'OVERDUE',
]);

// FR-WI-009 — per-item activity actions.
export const activityActionEnum = pgEnum('activity_action', [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'MOVED',
  'DELETED',
  'RESTORED',
  'COMMENTED',
  'SUBTASK_ADDED',
  'LABEL_ADDED',
  'LABEL_REMOVED',
]);

// Why a user watches an item (drives notification fan-out + mention context access, D9).
export const watcherReasonEnum = pgEnum('watcher_reason', [
  'ASSIGNEE',
  'AUTHOR',
  'MENTIONED',
  'MANUAL',
]);
