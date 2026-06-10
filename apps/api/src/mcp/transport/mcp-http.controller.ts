// `.js` suffix required by the SDK's extensionless `exports` map (see mcp-server.factory.ts).
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/rbac/decorators';
import { McpAuth } from '../mcp-auth';
import { MCP_SERVER_VERSION, buildMcpServer } from '../mcp-server.factory';
import { type McpSessionContext, createSession } from '../mcp-session';
import { McpToolDispatcher } from '../tools/tool-dispatch';

/**
 * Streamable HTTP / SSE MCP transport (M3, US4, FR-MCP-001, research D10), mounted in the `api`
 * process. A client connects with `Authorization: Bearer <PAT>`; we resolve it to a principal
 * (`McpAuth`, reusing M0 token verification), build a per-session server from the registry, and let
 * the SDK transport handle the JSON-RPC request. Stateless mode (`sessionIdGenerator: undefined`):
 * each request is self-contained and authenticated by its PAT — no server-side session store.
 *
 * The route is `@Public` so the global Auth/RBAC guards stand aside; the MCP edge does its OWN
 * default-deny RBAC per tool (scope ∩ role) inside the dispatcher. Tenant is the PAT principal's org,
 * re-established per tool call (`tenant.run`) — never a client field (Principle II).
 */
@Controller('mcp')
export class McpHttpController {
  constructor(
    private readonly auth: McpAuth,
    private readonly dispatcher: McpToolDispatcher,
  ) {}

  @Public()
  @Post()
  async handlePost(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handle(req, res);
  }

  @Public()
  @Get()
  async handleGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handle(req, res);
  }

  private async handle(req: Request, res: Response): Promise<void> {
    let session: McpSessionContext;
    try {
      const principal = await this.auth.resolvePrincipal(req.headers.authorization);
      session = createSession(principal);
    } catch {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid or revoked access token.' },
        id: null,
      });
      return;
    }

    const server = buildMcpServer(MCP_SERVER_VERSION, session, this.dispatcher);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    // Tear down per-request (stateless): the SDK closes the response; we release the server too.
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}
