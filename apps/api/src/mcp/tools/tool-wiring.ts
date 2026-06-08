import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  AddMember,
  AddSubtask,
  CreateApiToken,
  CreateComment,
  CreateInvite,
  CreateLabel,
  CreateProject,
  CreateStatus,
  CreateWorkItem,
  ListNotificationsQuery,
  MoveWorkItem,
  ReorderStatuses,
  Role,
  SaveView,
  SearchQuery,
  ToolInput,
  TransferOwnership,
  UpdateNotification,
  UpdateOrgSettings,
  UpdateProject,
  UpdateStatus,
  UpdateView,
  UpdateWorkItem,
} from '@rytask/contracts';
import { CommentsService } from '../../modules/comments/services/comments.service';
import { ApiTokensProvider } from '../../modules/identity/providers/api-tokens.provider';
import { NotificationsService } from '../../modules/notifications/services/notifications.service';
import { InviteProvider } from '../../modules/orgs/providers/invite.provider';
import { MemberAdminProvider } from '../../modules/orgs/providers/member-admin.provider';
import { OrgsService } from '../../modules/orgs/services/orgs.service';
import { ProjectsService } from '../../modules/projects/services/projects.service';
import { StatusesService } from '../../modules/projects/services/statuses.service';
import { SearchService } from '../../modules/search/services/search.service';
import { ViewsService } from '../../modules/views/services/views.service';
import { LabelsService } from '../../modules/work-items/services/labels.service';
import { WorkItemsService } from '../../modules/work-items/services/work-items.service';
import { ContextTools } from './context-tools';
import { toPaged } from './pagination';
import { McpToolDispatcher } from './tool-dispatch';

/** A generic DTO row for the page-envelope projection (list_issues / search). */
type Row = Record<string, unknown>;

/**
 * Wires every MCP tool to the EXISTING service the REST controller calls (M3, US4, T079–T082). The
 * MCP edge owns no domain — parity is structural, not duplicated: a tool runs the same code path its
 * REST sibling does, under the same RBAC + tenant context (established by {@link McpToolDispatcher}).
 *
 * Handlers receive the already-validated input and the per-session context. They:
 *   - unwrap the service `{ data }` envelopes into the raw DTO each tool's contract declares;
 *   - stamp capture tools with `source = 'MCP'` (capture-source.md §4);
 *   - shape `list_issues`/`search` into the `{ items, nextCursor }` page envelope (research D14);
 *   - act as the session principal for governance tools (members/tokens/transfer).
 *
 * It lives under `mcp/` (a transport edge, not a module), so it may inject the domain services
 * directly — the dependency-cruiser `no-cross-module-internals` rule scopes only to `modules/*`.
 */
@Injectable()
export class McpToolRegistrar implements OnModuleInit {
  constructor(
    private readonly dispatcher: McpToolDispatcher,
    private readonly context: ContextTools,
    private readonly workItems: WorkItemsService,
    private readonly labels: LabelsService,
    private readonly projects: ProjectsService,
    private readonly statuses: StatusesService,
    private readonly views: ViewsService,
    private readonly comments: CommentsService,
    private readonly notifications: NotificationsService,
    private readonly search: SearchService,
    private readonly orgs: OrgsService,
    private readonly members: MemberAdminProvider,
    private readonly invites: InviteProvider,
    private readonly tokens: ApiTokensProvider,
  ) {}

  onModuleInit(): void {
    this.wireWorkItems();
    this.wireProjectsStatusesViews();
    this.wireCollabSearch();
    this.wireContext();
    this.wireOrgAndTokens();
  }

  // — work items + labels (14) —
  private wireWorkItems(): void {
    const d = this.dispatcher;
    d.register('create_issue', async (input) => {
      const a = input as ToolInput<'create_issue'>;
      return this.workItems.create({ ...(a as CreateWorkItem), source: 'MCP' });
    });
    d.register('quick_add_issue', async (input) => {
      const a = input as ToolInput<'quick_add_issue'>;
      return this.workItems.create({ projectId: a.projectId, quickAdd: a.text, source: 'MCP' });
    });
    d.register('update_issue', async (input) => {
      const { id, ...rest } = input as ToolInput<'update_issue'>;
      return (await this.workItems.update(id, rest as UpdateWorkItem)).data;
    });
    d.register('delete_issue', async (input) => {
      await this.workItems.delete((input as ToolInput<'delete_issue'>).id);
      return null;
    });
    d.register('restore_issue', async (input) => {
      return (await this.workItems.restore((input as ToolInput<'restore_issue'>).id)).data;
    });
    d.register('move_issue', async (input) => {
      const { id, ...rest } = input as ToolInput<'move_issue'>;
      return (await this.workItems.move(id, rest as MoveWorkItem)).data;
    });
    d.register('add_subtask', async (input) => {
      const { parentId, ...rest } = input as ToolInput<'add_subtask'>;
      return this.workItems.addSubtask(parentId, rest as AddSubtask);
    });
    d.register('list_issues', async (input) => {
      const q = input as ToolInput<'list_issues'>;
      const res = await this.workItems.list({ filter: q.filter, limit: q.limit, cursor: q.cursor });
      return toPaged(res.data as unknown as Row[], res.pageInfo.nextCursor, q.fields);
    });
    d.register('get_issue', async (input) => {
      return (await this.workItems.get((input as ToolInput<'get_issue'>).id)).data;
    });
    d.register('add_label_to_issue', async (input) => {
      const a = input as ToolInput<'add_label_to_issue'>;
      return this.workItems.addLabel(a.id, { labelId: a.labelId, name: a.name });
    });
    d.register('remove_label_from_issue', async (input) => {
      const a = input as ToolInput<'remove_label_from_issue'>;
      await this.workItems.removeLabel(a.id, a.labelId);
      return null;
    });
    d.register('list_issue_activity', async (input) => {
      return (await this.workItems.listActivity((input as ToolInput<'list_issue_activity'>).id))
        .data;
    });
    d.register('list_labels', () => this.labels.list());
    d.register('create_label', async (input) => {
      return (await this.labels.create(input as CreateLabel)).data;
    });
  }

  // — projects (7) + statuses (5) + views (4) —
  private wireProjectsStatusesViews(): void {
    const d = this.dispatcher;
    d.register('list_projects', (input) => {
      const q = input as ToolInput<'list_projects'>;
      return this.projects.list({ limit: q.limit, cursor: q.cursor, includeArchived: false });
    });
    d.register('get_project', async (input) => {
      return (await this.projects.get((input as ToolInput<'get_project'>).id)).data;
    });
    d.register('create_project', async (input) => {
      return (await this.projects.create(input as CreateProject)).data;
    });
    d.register('update_project', async (input) => {
      const { id, ...rest } = input as ToolInput<'update_project'>;
      return (await this.projects.update(id, rest as UpdateProject)).data;
    });
    d.register('archive_project', async (input) => {
      const a = input as ToolInput<'archive_project'>;
      return (await this.projects.update(a.id, { archived: a.archived } as UpdateProject)).data;
    });
    d.register('delete_project', async (input) => {
      await this.projects.delete((input as ToolInput<'delete_project'>).id);
      return null;
    });
    d.register('add_project_member', async (input) => {
      const { projectId, ...rest } = input as ToolInput<'add_project_member'>;
      const member = rest as AddMember;
      await this.projects.addMember(projectId, member);
      return { userId: member.userId, role: member.role };
    });

    d.register('list_statuses', (input) =>
      this.statuses.list((input as ToolInput<'list_statuses'>).projectId),
    );
    d.register('create_status', async (input) => {
      const { projectId, ...rest } = input as ToolInput<'create_status'>;
      return (await this.statuses.create(projectId, rest as CreateStatus)).data;
    });
    d.register('update_status', async (input) => {
      const { id, ...rest } = input as ToolInput<'update_status'>;
      return (await this.statuses.update(id, rest as UpdateStatus)).data;
    });
    d.register('reorder_statuses', (input) => {
      const { projectId, ...rest } = input as ToolInput<'reorder_statuses'>;
      return this.statuses.reorder(projectId, rest as ReorderStatuses);
    });
    d.register('delete_status', async (input) => {
      const a = input as ToolInput<'delete_status'>;
      await this.statuses.delete(a.id, a.reassignTo ?? null);
      return null;
    });

    d.register('list_views', (input) =>
      this.views.list((input as ToolInput<'list_views'>).projectId),
    );
    d.register('save_view', async (input) => {
      return (await this.views.save(input as SaveView)).data;
    });
    d.register('update_view', async (input) => {
      const { id, ...rest } = input as ToolInput<'update_view'>;
      return (await this.views.update(id, rest as UpdateView)).data;
    });
    d.register('delete_view', async (input) => {
      await this.views.delete((input as ToolInput<'delete_view'>).id);
      return null;
    });
  }

  // — comments + notifications (4) + search (1) —
  private wireCollabSearch(): void {
    const d = this.dispatcher;
    d.register('list_comments', (input) =>
      this.comments.list((input as ToolInput<'list_comments'>).workItemId),
    );
    d.register('add_comment', async (input) => {
      const { workItemId, ...rest } = input as ToolInput<'add_comment'>;
      return (await this.comments.create(workItemId, rest as CreateComment)).data;
    });
    d.register('list_notifications', (input) =>
      this.notifications.list(input as ListNotificationsQuery),
    );
    d.register('update_notification', async (input) => {
      const { id, ...rest } = input as ToolInput<'update_notification'>;
      return (await this.notifications.update(id, rest as UpdateNotification)).data;
    });
    d.register('search', async (input) => {
      const res = await this.search.search(input as SearchQuery);
      return toPaged(res.data as unknown as Row[], null);
    });
  }

  // — identity / org context (4) —
  private wireContext(): void {
    const d = this.dispatcher;
    d.register('whoami', (_input, session) => this.context.whoami(session));
    d.register('list_workspaces', () => this.context.listWorkspaces());
    d.register('get_workspace', (input) =>
      this.context.getWorkspace((input as ToolInput<'get_workspace'>).id),
    );
    d.register('set_active_workspace', (input, session) =>
      this.context.setActiveWorkspace(
        (input as ToolInput<'set_active_workspace'>).workspaceId,
        session,
      ),
    );
  }

  // — org settings + membership (7) + personal access tokens (3) —
  private wireOrgAndTokens(): void {
    const d = this.dispatcher;
    d.register('get_org_settings', async () => (await this.orgs.current()).settings);
    d.register('update_org_settings', async (input) => {
      return (await this.members.updateSettings(input as UpdateOrgSettings)).settings;
    });
    d.register('transfer_ownership', async (input, session) => {
      await this.members.transferOwnership(session.principal, input as TransferOwnership);
      return null;
    });
    d.register('list_members', () => this.members.listMembers());
    d.register('invite_member', (input, session) =>
      this.invites.create(session.principal, input as CreateInvite),
    );
    d.register('set_member_role', (input, session) => {
      const a = input as ToolInput<'set_member_role'>;
      return this.members.setMemberRole(session.principal, a.userId, a.role as Role);
    });
    d.register('remove_member', async (input, session) => {
      await this.members.removeMember(
        session.principal,
        (input as ToolInput<'remove_member'>).userId,
      );
      return null;
    });

    d.register('list_api_tokens', (_input, session) => this.tokens.list(session.principal));
    d.register('create_api_token', (input, session) =>
      this.tokens.issue(session.principal, input as CreateApiToken),
    );
    d.register('revoke_api_token', async (input, session) => {
      await this.tokens.revoke(session.principal, (input as ToolInput<'revoke_api_token'>).id);
      return null;
    });
  }
}
