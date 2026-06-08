import { Injectable } from '@nestjs/common';
import type { WhoAmI, Workspace } from '@rytask/contracts';
import { WhoamiProvider } from '../../modules/identity/providers/whoami.provider';
import { WorkspacesService } from '../../modules/orgs/services/workspaces.service';
import { McpToolError } from '../mcp-errors';
import type { McpSessionContext } from '../mcp-session';

/**
 * MCP context tools (M3, US4, FR-MCP-003, mcp-server.md §3). They let an agent orient and scope
 * itself: `whoami` resolves the principal, `list_workspaces`/`get_workspace` enumerate access, and
 * `set_active_workspace` re-points the **transient** per-session active workspace (validated against
 * the accessible set). Subsequent tool calls are then scoped to that workspace by the dispatcher.
 *
 * The MCP edge owns no domain — these reuse the EXISTING identity/orgs services the REST `whoami`
 * and workspaces endpoints use (one brain everywhere). It lives under `mcp/` (a transport edge, not a
 * module), so it may inject those services directly.
 */
@Injectable()
export class ContextTools {
  constructor(
    private readonly whoamiProvider: WhoamiProvider,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** Resolve the principal; the active workspace reflects the SESSION (which `set_active_workspace` moves). */
  async whoami(session: McpSessionContext): Promise<WhoAmI> {
    const who = await this.whoamiProvider.build(session.principal);
    return { ...who, activeWorkspaceId: session.activeWorkspaceId };
  }

  /** Accessible workspaces in the principal's org. */
  listWorkspaces(): Promise<Workspace[]> {
    return this.workspaces.list();
  }

  /** A single workspace by id (tenant-scoped; NOT_FOUND outside the org). */
  getWorkspace(id: string): Promise<Workspace> {
    return this.workspaces.get(id);
  }

  /**
   * Re-point the transient active workspace, validated against the accessible set (data-model §2.1).
   * Returns the refreshed `whoami` so the agent sees the new scope. A reconnect resets to the default.
   */
  async setActiveWorkspace(workspaceId: string, session: McpSessionContext): Promise<WhoAmI> {
    const accessible = await this.workspaces.list();
    if (!accessible.some((w) => w.id === workspaceId)) {
      throw new McpToolError('NOT_FOUND', `Workspace not found: ${workspaceId}`);
    }
    session.setActiveWorkspace(workspaceId);
    return this.whoami(session);
  }
}
