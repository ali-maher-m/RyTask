import { Controller, Get } from '@nestjs/common';
import type { Organization } from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { OrgsService } from '../services/orgs.service';

/**
 * Organization REST surface under /api/v1 (contracts/openapi.yaml, FR-TEN-004). US1 exposes
 * the current-org read; US8 adds PATCH/DELETE/transfer-ownership. `@RequirePermission`
 * declares the gate; enforcement goes live in US4's RbacGuard.
 */
@Controller('orgs')
export class OrgsController {
  constructor(private readonly service: OrgsService) {}

  @RequirePermission('org:read')
  @Get('current')
  current(): Promise<Organization> {
    return this.service.current();
  }
}
