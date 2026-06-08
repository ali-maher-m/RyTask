import type { Principal } from '../common/auth/principal';

/**
 * Transient per-session MCP context (M3, data-model §2.1, FR-MCP-003). Held in memory for the
 * lifetime of a transport session (HTTP session id / stdio process) — NOT persisted. The active
 * workspace defaults to the principal's default workspace and can be re-pointed by
 * `set_active_workspace` to any workspace the principal can access (validated by the context
 * tool against `workspaces.list`, US4). A reconnect resets to the token/user default.
 */
export class McpSessionContext {
  private activeWorkspace: string | null;

  constructor(readonly principal: Principal) {
    this.activeWorkspace = principal.workspaceId ?? null;
  }

  get activeWorkspaceId(): string | null {
    return this.activeWorkspace;
  }

  /**
   * Re-point the active workspace. The caller (the `set_active_workspace` tool) MUST first verify
   * the id is one the principal can access — this setter only records the transient choice.
   */
  setActiveWorkspace(workspaceId: string): void {
    this.activeWorkspace = workspaceId;
  }
}

/** Build a fresh session context from a resolved principal (one per transport connection). */
export function createSession(principal: Principal): McpSessionContext {
  return new McpSessionContext(principal);
}
