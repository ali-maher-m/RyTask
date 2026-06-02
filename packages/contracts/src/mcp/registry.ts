/**
 * MCP tool registry — the single list of MCP tools the server exposes.
 *
 * INVARIANT (ADR-006, FR-INT-MCP-009): every service use case ("capability")
 * must have a matching MCP tool here. `scripts/check-mcp-parity.ts` enforces 100%
 * parity in CI. Empty at the scaffold stage (no capabilities yet); M0+ grows it.
 *
 * M0 registers the identity/orgs **domain** tool definitions (transport is deferred to the
 * MCP milestone, Complexity C1) so the surface can't drift. Credential-acquisition /
 * session-bootstrap flows (register/login/refresh/logout/verify/reset/bootstrap) are
 * **intentionally excluded** (research D11): an MCP client authenticates by PAT and never
 * performs them, so they are absent from `serviceCapabilities` by design — not a parity gap.
 */
export interface McpToolDefinition {
  /** Tool name as exposed over MCP, e.g. 'work_items.create'. */
  name: string;
  /** Human-readable description shown to MCP clients. */
  description: string;
  /** The service capability id this tool maps to (the parity key). */
  capability: string;
  /**
   * Destructive/irreversible action — the MCP transport (when it lands) requires an explicit
   * dry-run / confirmation flag before executing (mcp-tools.md §Safety, FR-INT-MCP-010).
   */
  destructive?: boolean;
}

export const mcpTools: McpToolDefinition[] = [
  // US4 — projects + membership (FR-PROJ-001/002). Tools call the same ProjectsService as REST.
  {
    name: 'list_projects',
    description: 'List accessible projects in the workspace (keyset paginated).',
    capability: 'projects.list',
  },
  {
    name: 'get_project',
    description: 'Get a single project (requires project:viewer).',
    capability: 'projects.get',
  },
  {
    name: 'create_project',
    description: 'Create a project (seeds default statuses + key counter + creator membership).',
    capability: 'projects.create',
  },
  {
    name: 'update_project',
    description: "Update a project's name / description / icon / color / lead.",
    capability: 'projects.update',
  },
  {
    name: 'archive_project',
    description: 'Archive or restore a project (hidden from default lists but retained).',
    capability: 'projects.archive',
  },
  {
    name: 'delete_project',
    description: 'Delete a project (cascade removes its items, statuses, members, counter).',
    capability: 'projects.delete',
  },
  {
    name: 'add_project_member',
    description: 'Add a member to a project at a role (ADMIN/MEMBER/VIEWER).',
    capability: 'projects.members.add',
  },
  // US1 — capture (FR-WI-001/002/004). Tools call the same WorkItemsService as REST.
  {
    name: 'create_issue',
    description: 'Create a work item (title-only or structured fields).',
    capability: 'workItems.create',
  },
  {
    name: 'quick_add_issue',
    description: 'Create a work item from a quick-add line (@assignee #label !priority ^date).',
    capability: 'workItems.quickAdd',
  },
  // US2 — detail (FR-WI-003/006/008/009, FR-LBL-001). Same WorkItemsService/LabelsService.
  {
    name: 'update_issue',
    description: "Update a work item's fields (optimistic version; logs activity per field).",
    capability: 'workItems.update',
  },
  {
    name: 'delete_issue',
    description: 'Soft-delete (trash) a work item.',
    capability: 'workItems.delete',
  },
  {
    name: 'restore_issue',
    description: 'Restore a work item from trash (comments + history intact).',
    capability: 'workItems.restore',
  },
  {
    name: 'add_label_to_issue',
    description: 'Attach a label to a work item (by id or name; create-on-capture).',
    capability: 'workItems.addLabel',
  },
  {
    name: 'remove_label_from_issue',
    description: 'Remove a label from a work item.',
    capability: 'workItems.removeLabel',
  },
  {
    name: 'list_issue_activity',
    description: "List a work item's activity / history feed.",
    capability: 'workItems.activity',
  },
  {
    name: 'list_labels',
    description: 'List workspace labels.',
    capability: 'labels.list',
  },
  {
    name: 'create_label',
    description: 'Create a workspace label.',
    capability: 'labels.create',
  },
  // US3 — board/list + customizable statuses (FR-WF-001/002, FR-VIEW-001). Same services.
  {
    name: 'list_issues',
    description: 'List / filter work items (List, Board, smart views) with keyset pagination.',
    capability: 'workItems.list',
  },
  {
    name: 'get_issue',
    description: 'Get a single work item (full payload incl. labels).',
    capability: 'workItems.get',
  },
  {
    name: 'move_issue',
    description: 'Move a work item on the board (change status and/or fractional position).',
    capability: 'workItems.move',
  },
  // US6 — sub-tasks (FR-HIER-001). Same WorkItemsService; cycle/depth checked server-side.
  {
    name: 'add_subtask',
    description: 'Create a sub-task under a work item (inherits its project; cycle/depth checked).',
    capability: 'workItems.addSubtask',
  },
  {
    name: 'list_statuses',
    description: 'List a project’s statuses (board columns, ordered).',
    capability: 'statuses.list',
  },
  {
    name: 'create_status',
    description: 'Add a status to a project (mapped to a fixed category).',
    capability: 'statuses.create',
  },
  {
    name: 'update_status',
    description: 'Rename / recolor / recategorize a status.',
    capability: 'statuses.update',
  },
  {
    name: 'reorder_statuses',
    description: 'Reorder a project’s statuses (board column order).',
    capability: 'statuses.reorder',
  },
  {
    name: 'delete_status',
    description: 'Delete a status (requires reassignTo when it still has items).',
    capability: 'statuses.delete',
  },
  // US5 — saved views (FR-VIEW-008). Tools call the same ViewsService as REST.
  {
    name: 'list_views',
    description: 'List saved views visible to the principal (own personal + shared in projects).',
    capability: 'views.list',
  },
  {
    name: 'save_view',
    description: 'Save a view (filter AST + sort + grouping + layout; personal or shared).',
    capability: 'views.save',
  },
  {
    name: 'update_view',
    description: 'Update a saved view (name / scope / filters / sort / grouping / layout).',
    capability: 'views.update',
  },
  {
    name: 'delete_view',
    description: 'Delete a saved view.',
    capability: 'views.delete',
  },
  // US7 — comments + notifications (FR-COLLAB-001/002, FR-NOTIF-001/002). Tools call
  // the same CommentsService/NotificationsService as REST.
  {
    name: 'list_comments',
    description: 'List threaded comments on a work item.',
    capability: 'comments.list',
  },
  {
    name: 'add_comment',
    description: 'Post a markdown comment (@mentions notify + grant context access).',
    capability: 'comments.create',
  },
  {
    name: 'list_notifications',
    description: 'List the inbox (unread / all / snoozed / archived), keyset paginated.',
    capability: 'notifications.list',
  },
  {
    name: 'update_notification',
    description: 'Mark a notification read/unread, snooze it, or archive it.',
    capability: 'notifications.update',
  },
  // US8 — search (FR-SRCH-001/004). Tool calls the same SearchService as REST; the result
  // set is tenant + permission scoped server-side.
  {
    name: 'search',
    description:
      'Full-text search across work items, comments, projects, labels, and users (ranked, permission-scoped).',
    capability: 'search.query',
  },
  // M0 — identity context (FR-INT-MCP-001). An MCP client authenticates by PAT that resolves
  // to a user principal; the agent acts as that user with min(scope, role). Credential flows
  // (login/register/refresh/verify/reset/bootstrap) are excluded by design (research D11).
  {
    name: 'whoami',
    description: 'Resolve the current principal: user, org, role, scopes, accessible workspaces.',
    capability: 'identity.whoami',
  },
  // M0 — orgs: workspaces (FR-INT-MCP-003). Same OrgsService as REST.
  {
    name: 'list_workspaces',
    description: 'List workspaces in the current organization.',
    capability: 'workspaces.list',
  },
  {
    name: 'get_workspace',
    description: 'Get a single workspace by id.',
    capability: 'workspaces.get',
  },
  {
    name: 'set_active_workspace',
    description: 'Set the active workspace for the session/principal.',
    capability: 'workspaces.setActive',
  },
  // M0 — orgs: settings + ownership (FR-TEN-004, FR-RBAC-003). Same OrgsService as REST.
  {
    name: 'get_org_settings',
    description: 'Read the organization settings (timezone, locale, week start, working hours…).',
    capability: 'orgs.settings.get',
  },
  {
    name: 'update_org_settings',
    description: 'Update organization settings (Owner/Admin).',
    capability: 'orgs.settings.update',
  },
  {
    name: 'transfer_ownership',
    description: 'Transfer organization ownership to another member (Owner only).',
    capability: 'orgs.transferOwnership',
    destructive: true,
  },
  // M0 — orgs: membership (FR-RBAC-001, FR-AUTH-011). Same membership service as REST.
  {
    name: 'list_members',
    description: 'List members of the organization and their roles.',
    capability: 'members.list',
  },
  {
    name: 'invite_member',
    description: 'Invite a member by email or shareable link, with a pre-assigned role (Admin+).',
    capability: 'members.invite',
  },
  {
    name: 'set_member_role',
    description: "Change a member's role (Admin+; last-owner protected).",
    capability: 'members.setRole',
  },
  {
    name: 'remove_member',
    description:
      'Remove a member; revokes their sessions and tokens (Admin+; last-owner protected).',
    capability: 'members.remove',
    destructive: true,
  },
  // M0 — identity: personal access tokens (FR-AUTH-007). Same identity service as REST.
  {
    name: 'list_api_tokens',
    description: 'List the holder’s own personal access tokens (never the secret).',
    capability: 'apiTokens.list',
  },
  {
    name: 'create_api_token',
    description: 'Mint a scoped personal access token (secret returned once).',
    capability: 'apiTokens.create',
  },
  {
    name: 'revoke_api_token',
    description: 'Revoke one of the holder’s own personal access tokens.',
    capability: 'apiTokens.revoke',
    destructive: true,
  },
];

export const mcpToolCapabilities = (): ReadonlySet<string> =>
  new Set(mcpTools.map((t) => t.capability));
