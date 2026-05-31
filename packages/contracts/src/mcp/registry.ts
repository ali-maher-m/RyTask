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

export const mcpTools: McpToolDefinition[] = [];

export const mcpToolCapabilities = (): ReadonlySet<string> =>
  new Set(mcpTools.map((t) => t.capability));
