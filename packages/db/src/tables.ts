import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';
import {
  activityActionEnum,
  captureSourceEnum,
  notificationTypeEnum,
  oneTimeTokenPurposeEnum,
  priorityEnum,
  projectRoleEnum,
  roleEnum,
  statusCategoryEnum,
  tokenTypeEnum,
  viewKindEnum,
  viewScopeEnum,
  watcherReasonEnum,
} from './enums';

/**
 * Organization settings (M0, FR-TEN-004) stored as `organizations.settings` jsonb and
 * re-exported through `@rytask/contracts` for the API DTO. All fields optional with
 * product defaults applied at read time; `allowPublicSignup` gates self-registration (D8).
 */
export interface OrgSettings {
  timezone?: string;
  locale?: string;
  weekStart?: 'SUNDAY' | 'MONDAY';
  /** ISO weekday numbers 0(Sun)–6(Sat). */
  workingDays?: number[];
  workingHours?: { start: string; end: string };
  logoUrl?: string | null;
  allowPublicSignup?: boolean;
}

/**
 * Drizzle schema — the SINGLE SOURCE OF TRUTH for the data model (ARCHITECTURE §5, §16.1).
 *
 * Tenancy spine (M0 foundation): organizations -> workspaces -> users.
 * M1 (data-model §2): projects/members/counters/statuses, work_items + labels/watchers/activity,
 * comments, views, notifications. Every tenant-scoped table carries `organization_id NOT NULL`
 * with a composite index leading on `organization_id` (ADR-002). IDs are UUIDv7 (sortable + safe to
 * expose, ADR-003). Timestamps are `timestamptz`.
 *
 * NOTE (data-model §6): `work_items.parent_id` / `comments.parent_id` self-FKs and the generated
 * `search_vector tsvector` columns + GIN indexes are emitted in the SQL migration (0001), not here —
 * they live at the SQL layer. The columns themselves are plain `uuid` here so the ORM can read/write
 * them; search is queried via raw `sql` fragments against the generated column.
 */

/** UUIDv7 primary key, generated app-side (PG16 has no native uuidv7). */
const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ────────────────────────────────────────────────────────────── tenancy spine

/** The tenant root. An Organization is the tenant boundary (FR-TEN). */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    // M0 (FR-TEN-004): org settings; (FR-TEN-006/D14): Owner-only soft-delete marker.
    settings: jsonb('settings').$type<OrgSettings>().notNull().default({}),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('organizations_slug_unique').on(t.slug)],
);

/** Workspaces live inside an organization. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (t) => [
    index('workspaces_org_idx').on(t.organizationId),
    uniqueIndex('workspaces_org_slug_unique').on(t.organizationId, t.slug),
  ],
);

/** Users are scoped to an organization (membership). */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    // M0 auth columns (FR-AUTH-001/003). `password_hash` null reserved for SSO-only (v2).
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('users_org_idx').on(t.organizationId),
    uniqueIndex('users_org_email_unique').on(t.organizationId, t.email),
  ],
);

// ──────────────────────────────────────────────── identity & orgs context (M0)

/** Role-bearing record linking a user to an organization (FR-RBAC-001, ARCHITECTURE §5.2). */
export const memberships = pgTable(
  'memberships',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('MEMBER'),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('memberships_org_idx').on(t.organizationId),
    uniqueIndex('memberships_org_user_unique').on(t.organizationId, t.userId),
    index('memberships_org_role_idx').on(t.organizationId, t.role),
  ],
);

/** Refresh-credential sessions: rotation lineage by `family_id`; access tokens are NOT stored (FR-AUTH-002). */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_org_user_idx').on(t.organizationId, t.userId),
    index('sessions_token_hash_idx').on(t.refreshTokenHash),
    index('sessions_family_idx').on(t.familyId),
  ],
);

/** Long-lived, named, scoped PAT/MCP credentials; secret stored only as a hash (FR-AUTH-007). */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: tokenTypeEnum('type').notNull().default('PAT'),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('api_tokens_org_idx').on(t.organizationId),
    index('api_tokens_token_hash_idx').on(t.tokenHash),
  ],
);

/** Pending offer to join at a role; single-use; revocable (FR-AUTH-011). Email null for link invites. */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    email: text('email'),
    role: roleEnum('role').notNull().default('MEMBER'),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invitations_org_idx').on(t.organizationId),
    index('invitations_token_hash_idx').on(t.tokenHash),
    // Partial unique (organization_id, lower(email)) WHERE accepted_at IS NULL AND
    // revoked_at IS NULL AND email IS NOT NULL — one live email-invite per address;
    // emitted at the SQL layer in the migration (drizzle-kit can't express the predicate).
  ],
);

/** Single-use, time-limited email tokens for verification & password reset (FR-AUTH-003). */
export const oneTimeTokens = pgTable(
  'one_time_tokens',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: oneTimeTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ott_org_user_idx').on(t.organizationId, t.userId),
    index('ott_token_hash_idx').on(t.tokenHash),
  ],
);

// ──────────────────────────────────────────────────────── projects context

/** A container for work items; owns its statuses, key prefix, membership, key sequence (FR-PROJ-001). */
export const projects = pgTable(
  'projects',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    description: text('description'),
    icon: text('icon'),
    color: text('color').notNull().default('#6B7280'),
    leadId: uuid('lead_id').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('projects_org_ws_idx').on(t.organizationId, t.workspaceId),
    uniqueIndex('projects_org_ws_prefix_unique').on(t.organizationId, t.workspaceId, t.keyPrefix),
  ],
);

/** Project membership governs access: only members (or org admins) may act (FR-PROJ-002). */
export const projectMembers = pgTable(
  'project_members',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRoleEnum('role').notNull().default('MEMBER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('project_members_org_project_idx').on(t.organizationId, t.projectId),
    uniqueIndex('project_members_project_user_unique').on(t.projectId, t.userId),
    index('project_members_org_user_idx').on(t.organizationId, t.userId),
  ],
);

/** Atomic per-project key sequence; keys never recycled (FR-WI-002, research D1). */
export const projectCounters = pgTable('project_counters', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  lastNumber: integer('last_number').notNull().default(0),
});

/** Per-project, customizable status rows mapped to a fixed category (FR-WF-001/002, ADR-004). */
export const statuses = pgTable(
  'statuses',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: statusCategoryEnum('category').notNull(),
    color: text('color').notNull().default('#6B7280'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (t) => [
    index('statuses_org_project_idx').on(t.organizationId, t.projectId),
    uniqueIndex('statuses_project_name_unique').on(t.projectId, t.name),
  ],
);

// ──────────────────────────────────────────────────────── work-items context

/** The core entity (FR-WI-001/002/003). `parent_id` self-FK + `search_vector` added in migration. */
export const workItems = pgTable(
  'work_items',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    statusId: uuid('status_id')
      .notNull()
      .references(() => statuses.id),
    priority: priorityEnum('priority').notNull().default('NONE'),
    // FR-CAP-002 (M3) — capture provenance: WEB (default) / SLACK / MCP / API. NOT NULL with a
    // default so the migration backfills existing rows safely. The channel, not the person —
    // orthogonal to reporterId; set server-side by WorkItemsService.create (data-model §1.3).
    source: captureSourceEnum('source').notNull().default('WEB'),
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
  },
  (t) => [
    index('wi_org_proj_status_idx').on(t.organizationId, t.projectId, t.statusId),
    uniqueIndex('wi_org_proj_number_unique').on(t.organizationId, t.projectId, t.number),
    index('wi_org_due_idx').on(t.organizationId, t.dueDate),
    index('wi_org_assignee_idx').on(t.organizationId, t.assigneeId),
    index('wi_org_parent_idx').on(t.organizationId, t.parentId),
  ],
);

/** Workspace-scoped labels, reusable across a workspace's projects (FR-LBL-001, D14). */
export const labels = pgTable(
  'labels',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#3B82F6'),
    ...timestamps,
  },
  (t) => [
    index('labels_org_ws_idx').on(t.organizationId, t.workspaceId),
    // Case-insensitive uniqueness per workspace is enforced in the migration (lower(name)).
  ],
);

/** Many-to-many between work items and labels. */
export const workItemLabels = pgTable(
  'work_item_labels',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.workItemId, t.labelId] }),
    index('work_item_labels_org_label_idx').on(t.organizationId, t.labelId),
  ],
);

/** Threaded markdown comments (FR-COLLAB-001/002, D9). `parent_id` self-FK + search_vector in migration. */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    ...timestamps,
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('comments_org_work_item_idx').on(t.organizationId, t.workItemId),
    index('comments_org_parent_idx').on(t.organizationId, t.parentId),
  ],
);

/** Drives notification fan-out + mention-granted context access (D9). */
export const workItemWatchers = pgTable(
  'work_item_watchers',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: watcherReasonEnum('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workItemId, t.userId] }),
    index('work_item_watchers_org_user_idx').on(t.organizationId, t.userId),
  ],
);

/** Append-only per-item activity / history (FR-WI-009, D11). No update/delete path. */
export const activity = pgTable(
  'activity',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workItemId: uuid('work_item_id')
      .notNull()
      .references(() => workItems.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: activityActionEnum('action').notNull(),
    field: text('field'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('activity_org_work_item_created_idx').on(t.organizationId, t.workItemId, t.createdAt),
  ],
);

// ──────────────────────────────────────────────────────────── views context

/** Saved views (rows). Smart views + My Work are code-defined ASTs, not rows (D7). */
export const views = pgTable(
  'views',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: viewKindEnum('kind').notNull(),
    scope: viewScopeEnum('scope').notNull().default('PERSONAL'),
    filters: jsonb('filters').notNull().default({}),
    grouping: jsonb('grouping'),
    sort: jsonb('sort').notNull().default([]),
    layout: jsonb('layout'),
    ...timestamps,
  },
  (t) => [
    index('views_org_project_idx').on(t.organizationId, t.projectId),
    index('views_org_owner_idx').on(t.organizationId, t.ownerId),
  ],
);

// ──────────────────────────────────────────────────── notifications context

/** In-app notifications; exactly-once via unique `dedupe_key` (FR-NOTIF-001/002, D10). */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull().default({}),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_org_recipient_created_idx').on(
      t.organizationId,
      t.recipientId,
      t.createdAt,
    ),
    uniqueIndex('notifications_dedupe_key_unique').on(t.dedupeKey),
    // Partial unread index (recipient_id WHERE read_at IS NULL) added in the migration.
  ],
);

// ───────────────────────────────────────────────────────── slack context (M3)

/**
 * Slack workspace connection (M3, US1, data-model §1.1). Links one Slack team to one RyTask
 * workspace; holds install/authorization metadata and the (AES-256-GCM-encrypted) bot token
 * needed to receive commands and reply. Tenant-scoped: `organization_id` NOT NULL leads every
 * composite index; the webhook resolves a verified `slack_team_id` → this row → org/workspace
 * server-side (never client-supplied). Disconnect is a soft revoke (`revoked_at`).
 */
export const slackWorkspaces = pgTable(
  'slack_workspaces',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    slackTeamId: text('slack_team_id').notNull(),
    slackTeamName: text('slack_team_name').notNull(),
    botUserId: text('bot_user_id').notNull(),
    botTokenCiphertext: text('bot_token_ciphertext').notNull(),
    botTokenIv: text('bot_token_iv').notNull(),
    botTokenTag: text('bot_token_tag').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    defaultProjectId: uuid('default_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    installedByUserId: uuid('installed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // A Slack team connects exactly once (global) — the webhook maps team_id → one connection.
    uniqueIndex('slack_ws_team_unique').on(t.slackTeamId),
    uniqueIndex('slack_ws_org_team_unique').on(t.organizationId, t.slackTeamId),
    index('slack_ws_org_idx').on(t.organizationId),
    index('slack_ws_org_workspace_idx').on(t.organizationId, t.workspaceId),
  ],
);

/**
 * Slack ↔ RyTask user mapping (M3, US1/US5, data-model §1.2). Associates a Slack user with a
 * RyTask user for attribution. Auto-created on connect by email match; manually linkable for
 * the rest. An unmapped Slack user (`user_id` null) can still capture (with a link prompt).
 */
export const slackUsers = pgTable(
  'slack_users',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    slackWorkspaceId: uuid('slack_workspace_id')
      .notNull()
      .references(() => slackWorkspaces.id, { onDelete: 'cascade' }),
    slackUserId: text('slack_user_id').notNull(),
    slackUserName: text('slack_user_name'),
    slackUserEmail: text('slack_user_email'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    mappedManually: boolean('mapped_manually').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('slack_user_org_ws_uid_unique').on(
      t.organizationId,
      t.slackWorkspaceId,
      t.slackUserId,
    ),
    index('slack_user_org_idx').on(t.organizationId),
    index('slack_user_org_user_idx').on(t.organizationId, t.userId),
    index('slack_user_email_idx').on(t.organizationId, t.slackUserEmail),
  ],
);

// ─────────────────────────────────────────────────────────── schema + types

export const schema = {
  organizations,
  workspaces,
  users,
  memberships,
  sessions,
  apiTokens,
  invitations,
  oneTimeTokens,
  projects,
  projectMembers,
  projectCounters,
  statuses,
  workItems,
  labels,
  workItemLabels,
  comments,
  workItemWatchers,
  activity,
  views,
  notifications,
  slackWorkspaces,
  slackUsers,
};
export type Schema = typeof schema;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type OneTimeToken = typeof oneTimeTokens.$inferSelect;
export type NewOneTimeToken = typeof oneTimeTokens.$inferInsert;
export type RoleType = (typeof roleEnum.enumValues)[number];
export type TokenType = (typeof tokenTypeEnum.enumValues)[number];
export type OneTimeTokenPurpose = (typeof oneTimeTokenPurposeEnum.enumValues)[number];

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type ProjectCounter = typeof projectCounters.$inferSelect;
export type NewProjectCounter = typeof projectCounters.$inferInsert;
export type Status = typeof statuses.$inferSelect;
export type NewStatus = typeof statuses.$inferInsert;
export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;
export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;
export type WorkItemLabel = typeof workItemLabels.$inferSelect;
export type NewWorkItemLabel = typeof workItemLabels.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type WorkItemWatcher = typeof workItemWatchers.$inferSelect;
export type NewWorkItemWatcher = typeof workItemWatchers.$inferInsert;
export type Activity = typeof activity.$inferSelect;
export type NewActivity = typeof activity.$inferInsert;
export type View = typeof views.$inferSelect;
export type NewView = typeof views.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type SlackWorkspace = typeof slackWorkspaces.$inferSelect;
export type NewSlackWorkspace = typeof slackWorkspaces.$inferInsert;
export type SlackUser = typeof slackUsers.$inferSelect;
export type NewSlackUser = typeof slackUsers.$inferInsert;
export type CaptureSource = (typeof captureSourceEnum.enumValues)[number];
