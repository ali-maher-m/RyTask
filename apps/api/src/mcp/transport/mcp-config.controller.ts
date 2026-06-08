import { Controller, Get, Inject } from '@nestjs/common';
import type { McpServerConfigDto } from '@rytask/contracts';
import {
  type IntegrationsConfigType,
  integrationsConfig,
} from '../../common/config/integrations.config';
import { RequirePermission } from '../../common/rbac/decorators';

/**
 * MCP endpoint config for the web (M3, US6, FR-WEB-110, web-surfaces.md §3.C). The Agent-access
 * page reads this to show how to connect an MCP client: the public HTTP/SSE URL (`MCP_PUBLIC_URL`,
 * `null` when unset → MCP inert) plus a stdio hint for the local transport. Served under `/api/v1`
 * and requires a session (`org:read`) — it carries no secret (the PAT is minted separately and
 * shown once via the reused M0 tokens panel). This is config exposure, NOT an MCP tool, so the
 * 49/49 parity gate is unaffected.
 */
@Controller('integrations/mcp')
export class McpConfigController {
  constructor(
    @Inject(integrationsConfig.KEY) private readonly integrations: IntegrationsConfigType,
  ) {}

  @RequirePermission('org:read')
  @Get('config')
  getConfig(): McpServerConfigDto {
    return {
      httpUrl: this.integrations.mcp.publicUrl ?? null,
      stdioHint: 'RYTASK_PAT=<your token> pnpm --filter @rytask/api mcp:stdio',
    };
  }
}
