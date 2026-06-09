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

// FR-RBAC-001 (M0) — built-in org roles, ordered most→least privileged (ordinal can drive UI).
export const roleEnum = pgEnum('role_type', ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER']);

// FR-AUTH-007 (M0) — credential type. PAT/MCP issued in M0; OAUTH reserved for v2 social login.
export const tokenTypeEnum = pgEnum('token_type', ['PAT', 'OAUTH', 'MCP']);

// FR-AUTH-003 (M0) — single-use email tokens. (api_tokens are separate, long-lived, listable.)
export const oneTimeTokenPurposeEnum = pgEnum('one_time_token_purpose', [
  'EMAIL_VERIFY',
  'PASSWORD_RESET',
]);

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

// FR-WI-009 — per-item activity actions. M2 (data-model §1) APPENDS the five TIME_* values at the
// end (never reorder existing values — migration safety: `ALTER TYPE … ADD VALUE` is positional).
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
  // M2 — time events in the existing per-item activity feed (FR-FIN-001, research D7).
  'TIME_STARTED',
  'TIME_STOPPED',
  'TIME_LOGGED',
  'TIME_EDITED',
  'TIME_DELETED',
]);

// Why a user watches an item (drives notification fan-out + mention context access, D9).
export const watcherReasonEnum = pgEnum('watcher_reason', [
  'ASSIGNEE',
  'AUTHOR',
  'MENTIONED',
  'MANUAL',
]);

// FR-CAP-002 (M3, data-model §1.3) — where a work item was captured from. Orthogonal to
// reporterId (the channel, not the person); set server-side at creation, surfaced as a badge.
export const captureSourceEnum = pgEnum('capture_source', ['WEB', 'SLACK', 'MCP', 'API']);

// M2 (data-model §1, research D14) — HOW a time entry was logged. Distinct from `captureSourceEnum`
// (the item's capture provenance): TIMER/MANUAL are time-only, WEB is capture-only, the SLACK/MCP/API
// channel words are the only shared sub-vocabulary — never the same enum (FR-FIN-002). M2 produces
// only TIMER and MANUAL; SLACK/MCP/API are reserved for the v2 time channels (FR-TT-004).
export const timeEntrySourceEnum = pgEnum('time_entry_source', [
  'TIMER',
  'MANUAL',
  'SLACK',
  'MCP',
  'API',
]);

// M2 (data-model §1, FR-TT-006, research D6) — planned vs interruption. Derived once at creation
// (item priority URGENT ⇒ INTERRUPTION, else PLANNED), snapshotted, explicitly overridable. Exactly
// two values so planned + interruption ALWAYS sum to the total (SC-005).
export const timeEntryClassEnum = pgEnum('time_entry_class', ['PLANNED', 'INTERRUPTION']);
