import { AgentAccessClient } from './agent-access-client';

/**
 * Agent (MCP) access settings (M3, US6, FR-WEB-110/111). Server shell that mounts the interactive
 * `AgentAccessClient`: shows the MCP server endpoint(s) + ≤5 plain-language connect steps and
 * reuses the M0 tokens panel to create (shown once) / scope / revoke Personal Access Tokens. Live,
 * per-request.
 */
export const dynamic = 'force-dynamic';

export default function AgentAccessPage() {
  return <AgentAccessClient />;
}
