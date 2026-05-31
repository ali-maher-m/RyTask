/**
 * MCP tool registry — the single list of MCP tools the server exposes.
 *
 * INVARIANT (ADR-006, FR-INT-MCP-009): every service use case ("capability")
 * must have a matching MCP tool here. `scripts/check-mcp-parity.ts` enforces 100%
 * parity in CI. Empty at the scaffold stage (no capabilities yet); M0+ grows it.
 */
export interface McpToolDefinition {
  /** Tool name as exposed over MCP, e.g. 'work_items.create'. */
  name: string;
  /** Human-readable description shown to MCP clients. */
  description: string;
  /** The service capability id this tool maps to (the parity key). */
  capability: string;
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
];

export const mcpToolCapabilities = (): ReadonlySet<string> =>
  new Set(mcpTools.map((t) => t.capability));
