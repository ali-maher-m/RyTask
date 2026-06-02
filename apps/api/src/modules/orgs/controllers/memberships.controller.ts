import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Req } from '@nestjs/common';
import { type Membership, type SetRole, setRoleSchema } from '@rytask/contracts';
import type { RequestWithPrincipal } from '../../../common/auth/principal';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { MemberAdminProvider } from '../providers/member-admin.provider';

/**
 * Memberships REST surface under /api/v1 (contracts/openapi.yaml, FR-RBAC-001/003). List is
 * `members:read`; role-change + removal are `members:write` (OWNER/ADMIN). The provider layers
 * the domain invariants on top: an Admin cannot modify an Owner (403), and neither a demotion
 * nor a removal may leave the org without an Owner (409, SC-015). Removal revokes the user's
 * sessions + tokens. The org/principal is server-resolved (Principle II).
 */
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly admin: MemberAdminProvider) {}

  @RequirePermission('members:read')
  @Get()
  list(): Promise<Membership[]> {
    return this.admin.listMembers();
  }

  @RequirePermission('members:write')
  @Patch(':userId')
  setRole(
    @Req() req: RequestWithPrincipal,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe<SetRole>(setRoleSchema)) body: SetRole,
  ): Promise<Membership> {
    return this.admin.setMemberRole(
      req.principal as NonNullable<RequestWithPrincipal['principal']>,
      userId,
      body.role,
    );
  }

  @RequirePermission('members:write')
  @Delete(':userId')
  @HttpCode(204)
  remove(@Req() req: RequestWithPrincipal, @Param('userId') userId: string): Promise<void> {
    return this.admin.removeMember(
      req.principal as NonNullable<RequestWithPrincipal['principal']>,
      userId,
    );
  }
}
