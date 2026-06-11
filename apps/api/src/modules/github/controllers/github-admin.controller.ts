import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  type CreateGithubConnectionInput,
  type CreateGithubConnectionResponse,
  type ListGithubConnectionsResponse,
  createGithubConnectionSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ConnectGithubProvider } from '../providers/connect-github.provider';
import { DisconnectGithubProvider } from '../providers/disconnect-github.provider';
import { ListGithubConnectionsProvider } from '../providers/list-github-connections.provider';

/**
 * GitHub connection administration (M5 — the Slack admin shape). Under the `/api/v1` prefix;
 * the tenant/org is the caller's resolved org (Principle II). Listing is visible to any member
 * (`org:read`); connect/disconnect require an admin (`org:settings:write` → OWNER/ADMIN). The
 * webhook secret appears ONLY in the create response (Principle VI).
 */
@Controller('integrations/github')
export class GithubAdminController {
  constructor(
    private readonly connect: ConnectGithubProvider,
    private readonly disconnect: DisconnectGithubProvider,
    private readonly list: ListGithubConnectionsProvider,
  ) {}

  @RequirePermission('org:read')
  @Get()
  listConnections(): Promise<ListGithubConnectionsResponse> {
    return this.list.list();
  }

  @RequirePermission('org:settings:write')
  @Post()
  createConnection(
    @Body(new ZodValidationPipe<CreateGithubConnectionInput>(createGithubConnectionSchema))
    body: CreateGithubConnectionInput,
  ): Promise<CreateGithubConnectionResponse> {
    return this.connect.connect(body);
  }

  @RequirePermission('org:settings:write')
  @Delete(':connectionId')
  @HttpCode(204)
  async deleteConnection(@Param('connectionId') connectionId: string): Promise<void> {
    await this.disconnect.disconnect(connectionId);
  }
}
