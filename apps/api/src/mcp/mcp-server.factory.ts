// Subpath import per the SDK's `typesVersions` map (which classic Node10 resolution honors,
// rewriting `server/mcp` → its bundled `.d.ts`). Node's `exports` map serves the matching JS
// build at runtime. Transports (HTTP/SSE + stdio, US4) import their entrypoints the same way.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { type McpToolName, mcpTools, toolInput } from '@rytask/contracts';
import { toMcpError } from './mcp-errors';
import type { McpSessionContext } from './mcp-session';
import type { McpToolDispatcher } from './tools/tool-dispatch';

const SERVER_NAME = 'rytask';

/** Advertised MCP server version (M3). Bumped with the tool surface; transports pass it through. */
export const MCP_SERVER_VERSION = '1.0.0';

/**
 * Build one MCP server exposing all registry tools (M3, research D10). Each tool's input schema
 * is the `tool-io.ts` zod shape (the SAME schema REST validates with); each call is delegated to
 * the shared {@link McpToolDispatcher} (validate → RBAC → tenant.run → service), so REST and MCP
 * run the SAME code path — parity is structural, not duplicated. A server is built per
 * authenticated session; the transports connect it in US4. Tool results are returned as text +
 * `structuredContent`; categorized errors surface with `isError`.
 */
export function buildMcpServer(
  version: string,
  session: McpSessionContext,
  dispatcher: McpToolDispatcher,
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version });
  const schemas = toolInput as Record<string, { shape: Record<string, unknown> }>;

  for (const tool of mcpTools) {
    const inputSchema = schemas[tool.name]?.shape;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: inputSchema as never,
      },
      (async (args: unknown) => {
        try {
          const result = await dispatcher.dispatch(session, tool.name as McpToolName, args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result ?? null) }],
            structuredContent: (result ?? {}) as Record<string, unknown>,
          };
        } catch (err) {
          const error = toMcpError(err);
          return {
            content: [{ type: 'text' as const, text: `${error.code}: ${error.message}` }],
            isError: true,
          };
        }
      }) as never,
    );
  }

  return server;
}
