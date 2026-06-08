'use client';

import type { McpServerConfigDto } from '@rytask/contracts';
import { authedRequest } from './http';

/**
 * MCP server config resource module (M3, US6, web-surfaces.md §3.C). `GET /integrations/mcp/config`
 * returns the public endpoint(s) the Agent-access page shows so a human can connect an MCP client.
 * Returns the resource **bare** (no `{ data }` envelope), consumed directly. Carries no secret —
 * the PAT is minted separately via the reused M0 tokens panel.
 */
export function getMcpConfig(): Promise<McpServerConfigDto> {
  return authedRequest<McpServerConfigDto>('/integrations/mcp/config');
}
