import { Injectable } from '@nestjs/common';
import { type McpToolName, toolInput } from '@rytask/contracts';
import { type Permission, patHasPermission } from '../../common/rbac/permissions';
import { TenantContextService } from '../../common/tenancy/tenant-context.service';
import { McpToolError, toMcpError } from '../mcp-errors';
import type { McpSessionContext } from '../mcp-session';

/**
 * A wired tool handler: receives the validated input AND the per-session context (so context tools
 * can read/repoint the active workspace and governance tools can act as the session principal). It
 * runs inside the tenant context the dispatcher establishes and returns a DTO.
 */
export type ToolHandler = (input: unknown, session: McpSessionContext) => Promise<unknown>;

/**
 * The org-level RBAC permission each tool requires (M3, research D9). This is the SAME coarse
 * gate the REST controllers use (`work:read`/`work:write`, `members:*`, `org:settings:write`,
 * `tokens:*`, …); finer project-role enforcement still happens downstream in the services
 * (`ProjectAccessService`). Effective permission for a PAT = scope ∩ role (default-deny).
 */
export const TOOL_PERMISSIONS: Record<McpToolName, Permission> = {
  // work items + labels
  create_issue: 'work:write',
  quick_add_issue: 'work:write',
  update_issue: 'work:write',
  delete_issue: 'work:write',
  restore_issue: 'work:write',
  move_issue: 'work:write',
  add_subtask: 'work:write',
  list_issues: 'work:read',
  get_issue: 'work:read',
  add_label_to_issue: 'work:write',
  remove_label_from_issue: 'work:write',
  list_issue_activity: 'work:read',
  list_labels: 'work:read',
  create_label: 'work:write',
  // projects + membership
  list_projects: 'work:read',
  get_project: 'work:read',
  create_project: 'work:write',
  update_project: 'work:write',
  archive_project: 'work:write',
  delete_project: 'work:write',
  add_project_member: 'work:write',
  // statuses
  list_statuses: 'work:read',
  create_status: 'work:write',
  update_status: 'work:write',
  reorder_statuses: 'work:write',
  delete_status: 'work:write',
  // saved views
  list_views: 'work:read',
  save_view: 'work:write',
  update_view: 'work:write',
  delete_view: 'work:write',
  // comments + notifications
  list_comments: 'work:read',
  add_comment: 'work:write',
  list_notifications: 'work:read',
  update_notification: 'work:write',
  // search
  search: 'work:read',
  // identity / org context
  whoami: 'self',
  list_workspaces: 'workspace:read',
  get_workspace: 'workspace:read',
  set_active_workspace: 'workspace:read',
  // org settings + membership
  get_org_settings: 'org:read',
  update_org_settings: 'org:settings:write',
  transfer_ownership: 'org:transfer',
  list_members: 'members:read',
  invite_member: 'members:invite',
  set_member_role: 'members:write',
  remove_member: 'members:write',
  // personal access tokens
  list_api_tokens: 'tokens:read',
  create_api_token: 'tokens:write',
  revoke_api_token: 'tokens:write',
};

/**
 * The MCP tool dispatcher (M3, research D2/D9/D12). Cross-cutting for EVERY tool call:
 *   1. validate the input against `tool-io.ts` (same zod REST validates with),
 *   2. enforce scope ∩ role (default-deny) — a read-only token can't mutate,
 *   3. re-establish the tenant context (`tenant.run`) from the SERVER-resolved principal,
 *   4. invoke the wired handler and categorize any error (D12).
 * Per-domain handlers are registered by the US4 wiring (T078–T082); until then a call to an
 * unwired tool returns INTERNAL. The MCP edge owns no domain — handlers call the same services
 * the REST controllers do (parity is structural, not duplicated).
 */
@Injectable()
export class McpToolDispatcher {
  private readonly handlers = new Map<McpToolName, ToolHandler>();

  constructor(private readonly tenant: TenantContextService) {}

  /** Register a tool's handler (per-domain wiring, US4). Last registration wins. */
  register(name: McpToolName, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async dispatch(session: McpSessionContext, name: string, rawArgs: unknown): Promise<unknown> {
    const schemas = toolInput as Record<string, { parse(value: unknown): unknown } | undefined>;
    const schema = schemas[name];
    if (!schema) {
      throw new McpToolError('NOT_FOUND', `Unknown tool: ${name}`);
    }
    const toolName = name as McpToolName;

    let input: unknown;
    try {
      input = schema.parse(rawArgs);
    } catch (err) {
      throw toMcpError(err);
    }

    // Default-deny: the token must hold the tool's permission within its scope ∩ role.
    const { principal } = session;
    if (
      !principal.role ||
      !patHasPermission(principal.role, principal.scopes ?? [], TOOL_PERMISSIONS[toolName])
    ) {
      throw new McpToolError('PERMISSION_DENIED', `Not permitted: ${name}`);
    }

    const handler = this.handlers.get(toolName);
    if (!handler) {
      throw new McpToolError('INTERNAL', `Tool not yet wired: ${name}`);
    }

    // Re-establish tenant context off-request from the server-resolved principal (Principle II).
    return this.tenant.run(
      {
        organizationId: principal.organizationId,
        workspaceId: session.activeWorkspaceId ?? undefined,
        userId: principal.userId,
        isOrgAdmin: principal.isOrgAdmin,
      },
      async () => {
        try {
          return await handler(input, session);
        } catch (err) {
          throw toMcpError(err);
        }
      },
    );
  }
}
