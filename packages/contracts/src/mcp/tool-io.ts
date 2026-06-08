import { z } from 'zod';
import { type Comment, type CommentListResponse, createCommentSchema } from '../comments.contract';
import type { Role, Workspace } from '../common.contract';
import {
  type ApiTokenDto,
  type ApiTokenSecret,
  type WhoAmI,
  createApiTokenSchema,
} from '../identity.contract';
import { type Label, type LabelListResponse, createLabelSchema } from '../labels.contract';
import {
  type Notification,
  type NotificationListResponse,
  listNotificationsQuerySchema,
  updateNotificationSchema,
} from '../notifications.contract';
import {
  type Invitation,
  type Membership,
  type OrgSettings,
  createInviteSchema,
  setRoleSchema,
  transferOwnershipSchema,
  updateOrgSettingsSchema,
} from '../orgs.contract';
import {
  type MemberListResponse,
  type Project,
  type ProjectListResponse,
  type ProjectMember,
  addMemberSchema,
  createProjectSchema,
  updateProjectSchema,
} from '../projects.contract';
import { type SearchResult, searchQuerySchema } from '../search.contract';
import {
  type Status,
  type StatusListResponse,
  createStatusSchema,
  reorderStatusesSchema,
  updateStatusSchema,
} from '../statuses.contract';
import {
  type View,
  type ViewListResponse,
  saveViewSchema,
  updateViewSchema,
} from '../views.contract';
import {
  type ActivityEntry,
  type CreateWorkItemResponse,
  type WorkItem,
  addSubtaskSchema,
  createWorkItemSchema,
  moveWorkItemSchema,
  updateWorkItemSchema,
} from '../work-items.contract';

/**
 * Per-tool MCP I/O contract (M3, FR-MCP-004/005, research D13/D14). One entry per registry
 * tool maps the tool name to its **input** zod schema and **output** type. Inputs REUSE the
 * existing REST `*.contract.ts` zod where present (e.g. `createWorkItemSchema`) so MCP and REST
 * validate identically — single contract, drift-proof. Path parameters the REST endpoint takes
 * from the URL (an item id, a project id) are folded into the tool input via `.extend(...)`,
 * since an MCP tool receives a single argument object. The dispatcher validates an incoming
 * tool call against `toolInput[name]` before calling the service (T025).
 */

const uuid = z.string().uuid();
/** Common single-id input (by-id reads / deletes / restores). */
const byId = z.object({ id: uuid }).strict();
/** No-argument tools (whoami, list_workspaces, get_org_settings, …). */
const noArgs = z.object({}).strict();

/**
 * Shared list/search query envelope (FR-MCP-005, research D14). `filter` is the same serialized
 * M1 filter the UI sends; `limit` is server-capped; `cursor` is an opaque keyset cursor; `fields`
 * trims the projection to fit a token budget. Results are paged, never silently truncated.
 */
export const listQuery = z
  .object({
    filter: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().optional(),
    fields: z.array(z.string()).optional(),
  })
  .strict();
export type ListQuery = z.infer<typeof listQuery>;

/** The cursor-paginated response envelope every list/search tool returns (research D14). */
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Input schema per tool. Keys MUST stay in lock-step with `mcpTools` in `registry.ts`
 * (the parity gate keeps the tool list itself green; this map gives each tool its I/O).
 */
export const toolInput = {
  // — work items + labels (14) —
  create_issue: createWorkItemSchema,
  quick_add_issue: z.object({ projectId: uuid.optional(), text: z.string().min(1) }).strict(),
  update_issue: updateWorkItemSchema.extend({ id: uuid }),
  delete_issue: byId,
  restore_issue: byId,
  move_issue: moveWorkItemSchema.extend({ id: uuid }),
  add_subtask: addSubtaskSchema.extend({ parentId: uuid }),
  list_issues: listQuery,
  get_issue: byId,
  add_label_to_issue: z
    .object({ id: uuid, labelId: uuid.optional(), name: z.string().min(1).max(60).optional() })
    .strict(),
  remove_label_from_issue: z.object({ id: uuid, labelId: uuid }).strict(),
  list_issue_activity: byId,
  list_labels: noArgs,
  create_label: createLabelSchema,
  // — projects + membership (7) —
  list_projects: listQuery,
  get_project: byId,
  create_project: createProjectSchema,
  update_project: updateProjectSchema.extend({ id: uuid }),
  archive_project: z.object({ id: uuid, archived: z.boolean().default(true) }).strict(),
  delete_project: byId,
  add_project_member: addMemberSchema.extend({ projectId: uuid }),
  // — statuses (5) —
  list_statuses: z.object({ projectId: uuid }).strict(),
  create_status: createStatusSchema.extend({ projectId: uuid }),
  update_status: updateStatusSchema.extend({ id: uuid }),
  reorder_statuses: reorderStatusesSchema.extend({ projectId: uuid }),
  delete_status: z.object({ id: uuid, reassignTo: uuid.optional() }).strict(),
  // — saved views (4) —
  list_views: z.object({ projectId: uuid.optional() }).strict(),
  save_view: saveViewSchema,
  update_view: updateViewSchema.extend({ id: uuid }),
  delete_view: byId,
  // — comments + notifications (4) —
  list_comments: z.object({ workItemId: uuid }).strict(),
  add_comment: createCommentSchema.extend({ workItemId: uuid }),
  list_notifications: listNotificationsQuerySchema,
  update_notification: updateNotificationSchema.extend({ id: uuid }),
  // — search (1) —
  search: searchQuerySchema,
  // — identity / org context (4) —
  whoami: noArgs,
  list_workspaces: noArgs,
  get_workspace: byId,
  set_active_workspace: z.object({ workspaceId: uuid }).strict(),
  // — org settings + membership (7) —
  get_org_settings: noArgs,
  update_org_settings: updateOrgSettingsSchema,
  transfer_ownership: transferOwnershipSchema,
  list_members: noArgs,
  invite_member: createInviteSchema,
  set_member_role: setRoleSchema.extend({ userId: uuid }),
  remove_member: z.object({ userId: uuid }).strict(),
  // — personal access tokens (3) —
  list_api_tokens: noArgs,
  create_api_token: createApiTokenSchema,
  revoke_api_token: byId,
} satisfies Record<string, z.ZodTypeAny>;

/** The exhaustive set of MCP tool names, derived from the I/O map. */
export type McpToolName = keyof typeof toolInput;

/** Parsed input type for a given tool. */
export type ToolInput<K extends McpToolName> = z.infer<(typeof toolInput)[K]>;

/**
 * Output type per tool — the SAME DTO shape its REST sibling returns (research D12). List/search
 * tools the spec marks cursored (`list_issues`, `search`) return the `Paged<T>` envelope (§6);
 * other list tools return their existing REST list responses. Mutations that the REST layer
 * answers with `204` return `void`.
 */
export interface ToolOutput {
  // work items + labels
  create_issue: CreateWorkItemResponse;
  quick_add_issue: CreateWorkItemResponse;
  update_issue: WorkItem;
  delete_issue: null;
  restore_issue: WorkItem;
  move_issue: WorkItem;
  add_subtask: CreateWorkItemResponse;
  list_issues: Paged<WorkItem>;
  get_issue: WorkItem;
  add_label_to_issue: { labelId: string };
  remove_label_from_issue: null;
  list_issue_activity: ActivityEntry[];
  list_labels: LabelListResponse;
  create_label: Label;
  // projects + membership
  list_projects: ProjectListResponse;
  get_project: Project;
  create_project: Project;
  update_project: Project;
  archive_project: Project;
  delete_project: null;
  add_project_member: ProjectMember;
  // statuses
  list_statuses: StatusListResponse;
  create_status: Status;
  update_status: Status;
  reorder_statuses: StatusListResponse;
  delete_status: null;
  // views
  list_views: ViewListResponse;
  save_view: View;
  update_view: View;
  delete_view: null;
  // comments + notifications
  list_comments: CommentListResponse;
  add_comment: Comment;
  list_notifications: NotificationListResponse;
  update_notification: Notification;
  // search
  search: Paged<SearchResult>;
  // identity / org context
  whoami: WhoAmI;
  list_workspaces: Workspace[];
  get_workspace: Workspace;
  set_active_workspace: WhoAmI;
  // org settings + membership
  get_org_settings: OrgSettings;
  update_org_settings: OrgSettings;
  transfer_ownership: null;
  list_members: MemberListResponse;
  invite_member: Invitation;
  set_member_role: Membership;
  remove_member: null;
  // personal access tokens
  list_api_tokens: ApiTokenDto[];
  create_api_token: ApiTokenSecret;
  revoke_api_token: null;
}

/** Compile-time assertion that every tool with an input schema also declares an output type. */
type _AssertOutputsCoverInputs = McpToolName extends keyof ToolOutput ? true : never;
const _outputsCoverInputs: _AssertOutputsCoverInputs = true;
void _outputsCoverInputs;

/** Org roles re-exported for tool argument typing convenience (set_member_role / invites). */
export type { Role };
