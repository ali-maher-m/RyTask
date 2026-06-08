/**
 * MCP server connection config (M3, US6, FR-WEB-110, web-surfaces.md §3.C). The endpoint(s) the
 * Agent-access page shows so a human can connect an MCP client. Carries NO secret — a PAT is minted
 * separately via the reused M0 tokens panel and shown exactly once (Principle VI).
 */
export interface McpServerConfigDto {
  /** Public streamable-HTTP/SSE endpoint, or `null` when MCP isn't configured (`MCP_PUBLIC_URL`). */
  httpUrl: string | null;
  /** A short, copy-pasteable hint for the local stdio transport (same image, third entrypoint). */
  stdioHint: string;
}
