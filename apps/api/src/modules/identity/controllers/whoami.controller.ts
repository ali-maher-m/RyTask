import { Controller, Get, Req } from '@nestjs/common';
import type { WhoAmI } from '@rytask/contracts';
import type { RequestWithPrincipal } from '../../../common/auth/principal';
import { RequirePermission } from '../../../common/rbac/decorators';
import { WhoamiProvider } from '../providers/whoami.provider';

/**
 * `GET /auth/whoami` (FR-INT-MCP-001) — the current principal: user, org, role, scopes,
 * accessible workspaces. Requires a verified principal (`self`); AuthGuard guarantees it.
 */
@Controller('auth')
export class WhoamiController {
  constructor(private readonly whoami: WhoamiProvider) {}

  @RequirePermission('self')
  @Get('whoami')
  build(@Req() req: RequestWithPrincipal): Promise<WhoAmI> {
    // Non-public route: AuthGuard guarantees `req.principal` is set.
    return this.whoami.build(req.principal as NonNullable<RequestWithPrincipal['principal']>);
  }
}
