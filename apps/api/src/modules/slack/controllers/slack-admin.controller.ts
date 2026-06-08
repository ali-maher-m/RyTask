import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type MapSlackUser,
  type SlackConnectionDto,
  type SlackUserMappingDto,
  type UpdateSlackConnection,
  mapSlackUserSchema,
  updateSlackConnectionSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { SLACK_SERVICE, type SlackService } from '../slack.contract';

/**
 * Slack connection administration (US1, FR-WEB-101/103, FR-SLK-003, slack-rest.md §C). Under the
 * `/api/v1` prefix; the tenant/org is the caller's resolved org (Principle II). Status is visible
 * to any member (`org:read`); mutations require an admin (`org:settings:write` → OWNER/ADMIN) —
 * a non-admin write returns 403 (the UI hides the controls cosmetically). No secret in any
 * response (Principle VI). The user-mapping routes (US5) are admin-only — listing + linking
 * Slack identities to RyTask users for correct capture attribution (FR-SLK-002, FR-WEB-102).
 */
@Controller('integrations/slack')
export class SlackAdminController {
  constructor(@Inject(SLACK_SERVICE) private readonly slack: SlackService) {}

  @RequirePermission('org:read')
  @Get()
  getConnection(): Promise<SlackConnectionDto> {
    return this.slack.getConnection();
  }

  @RequirePermission('org:settings:write')
  @Patch()
  updateConnection(
    @Body(new ZodValidationPipe<UpdateSlackConnection>(updateSlackConnectionSchema))
    body: UpdateSlackConnection,
  ): Promise<SlackConnectionDto> {
    return this.slack.updateConnection(body);
  }

  @RequirePermission('org:settings:write')
  @Delete()
  @HttpCode(204)
  disconnect(): Promise<void> {
    return this.slack.disconnect();
  }

  // ── User mapping (US5, slack-rest.md §C) — admin-only, tenant-scoped ──────────────────────────

  @RequirePermission('org:settings:write')
  @Get('users')
  listUsers(): Promise<SlackUserMappingDto[]> {
    return this.slack.listSlackUsers();
  }

  @RequirePermission('org:settings:write')
  @Post('users/:slackUserId/map')
  mapUser(
    @Param('slackUserId') slackUserId: string,
    @Body(new ZodValidationPipe<MapSlackUser>(mapSlackUserSchema)) body: MapSlackUser,
  ): Promise<SlackUserMappingDto> {
    return this.slack.mapSlackUser(slackUserId, body.userId);
  }

  @RequirePermission('org:settings:write')
  @Delete('users/:slackUserId/map')
  @HttpCode(204)
  unmapUser(@Param('slackUserId') slackUserId: string): Promise<void> {
    return this.slack.unmapSlackUser(slackUserId);
  }
}
