// Subpath import per the SDK's `typesVersions` map (same resolution the factory uses for `server/mcp`).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { McpAuth } from '../mcp-auth';
import { MCP_SERVER_VERSION, buildMcpServer } from '../mcp-server.factory';
import { createSession } from '../mcp-session';
import { McpToolDispatcher } from '../tools/tool-dispatch';

/**
 * Local stdio MCP entrypoint (M3, US4, FR-MCP-001, research D10) — a THIRD entrypoint of the same
 * image (alongside `api` and `worker`), so no new service (Principle VII). It boots a non-HTTP Nest
 * application context (which wires every service + registers the tool handlers via the registrar's
 * `onModuleInit`), resolves the `RYTASK_PAT` into a principal, and serves the SAME server the HTTP
 * transport does over stdio.
 *
 * Nest logging is disabled because stdout IS the JSON-RPC channel — anything else printed there
 * would corrupt the protocol stream.
 */
export async function runMcpStdio(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  await app.init();

  const auth = app.get(McpAuth);
  const dispatcher = app.get(McpToolDispatcher);

  const principal = await auth.resolvePrincipal(process.env.RYTASK_PAT);
  const session = createSession(principal);
  const server = buildMcpServer(MCP_SERVER_VERSION, session, dispatcher);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    await server.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}
