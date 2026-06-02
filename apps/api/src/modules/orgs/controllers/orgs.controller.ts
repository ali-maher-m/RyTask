import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import {
  type Organization,
  type TransferOwnership,
  type UpdateOrgSettings,
  transferOwnershipSchema,
  updateOrgSettingsSchema,
} from '@rytask/contracts';
import type { RequestWithPrincipal } from '../../../common/auth/principal';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { MemberAdminProvider } from '../providers/member-admin.provider';
import { OrgsService } from '../services/orgs.service';

/**
 * Organization REST surface under /api/v1 (contracts/openapi.yaml, FR-TEN-004, FR-RBAC-003).
 * US1 read; US8 settings update (`org:settings:write`) + Owner-only delete (`org:delete`) and
 * transfer-ownership (`org:transfer`) — those permissions live only in OWNER, so the RbacGuard
 * makes them Owner-only. The org/principal is resolved server-side, never from the body.
 */
@Controller('orgs')
export class OrgsController {
  constructor(
    private readonly service: OrgsService,
    private readonly admin: MemberAdminProvider,
  ) {}

  @RequirePermission('org:read')
  @Get('current')
  current(): Promise<Organization> {
    return this.service.current();
  }

  @RequirePermission('org:settings:write')
  @Patch('current')
  updateSettings(
    @Body(new ZodValidationPipe<UpdateOrgSettings>(updateOrgSettingsSchema))
    body: UpdateOrgSettings,
  ): Promise<Organization> {
    return this.admin.updateSettings(body);
  }

  @RequirePermission('org:delete')
  @Delete('current')
  @HttpCode(204)
  remove(): Promise<void> {
    return this.admin.softDeleteOrg();
  }

  @RequirePermission('org:transfer')
  @Post('current/transfer-ownership')
  @HttpCode(204)
  transferOwnership(
    @Req() req: RequestWithPrincipal,
    @Body(new ZodValidationPipe<TransferOwnership>(transferOwnershipSchema))
    body: TransferOwnership,
  ): Promise<void> {
    return this.admin.transferOwnership(
      req.principal as NonNullable<RequestWithPrincipal['principal']>,
      body,
    );
  }
}
