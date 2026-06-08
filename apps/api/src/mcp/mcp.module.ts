import { Module } from '@nestjs/common';
import { CommentsModule } from '../modules/comments/comments.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { SearchModule } from '../modules/search/search.module';
import { ViewsModule } from '../modules/views/views.module';
import { McpAuth } from './mcp-auth';
import { ContextTools } from './tools/context-tools';
import { McpToolDispatcher } from './tools/tool-dispatch';
import { McpToolRegistrar } from './tools/tool-wiring';
import { McpConfigController } from './transport/mcp-config.controller';
import { McpHttpController } from './transport/mcp-http.controller';

/**
 * MCP transport edge (M3, research D1/D10) — NOT a domain module. It authenticates a PAT into a
 * principal (`McpAuth`, reusing M0 `TokenVerifier`), and dispatches tool calls to the EXISTING
 * services under the same RBAC + tenant context as REST (`McpToolDispatcher` + `McpToolRegistrar`,
 * US4). The streamable-HTTP/SSE transport is the `McpHttpController`; the stdio entrypoint
 * (`main.mcp.ts`) reuses the same providers. The work-items/projects/orgs/identity modules are
 * `@Global` (their exported services inject here); Views/Comments/Notifications/Search are imported
 * explicitly so THEIR services inject too. The edge reaches only services, never repositories.
 */
@Module({
  imports: [ViewsModule, CommentsModule, NotificationsModule, SearchModule],
  controllers: [McpHttpController, McpConfigController],
  providers: [McpAuth, McpToolDispatcher, ContextTools, McpToolRegistrar],
  exports: [McpAuth, McpToolDispatcher],
})
export class McpModule {}
