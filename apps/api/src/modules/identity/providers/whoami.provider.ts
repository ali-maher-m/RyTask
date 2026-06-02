import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { WhoAmI } from '@rytask/contracts';
import type { Principal } from '../../../common/auth/principal';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { UsersRepository } from '../repositories/users.repository';
import { toUserSummary } from './user.mapper';

/**
 * Resolve the current principal into the `whoami` payload (US2, FR-INT-MCP-001): user, org,
 * active workspace, role, scopes, and accessible workspaces.
 */
@Injectable()
export class WhoamiProvider {
  constructor(
    private readonly users: UsersRepository,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
  ) {}

  async build(principal: Principal): Promise<WhoAmI> {
    const user = await this.users.findById(principal.userId);
    if (!user || !principal.role) {
      throw new UnauthorizedException('principal not found');
    }
    return {
      user: toUserSummary(user),
      organizationId: principal.organizationId,
      activeWorkspaceId: principal.workspaceId ?? null,
      role: principal.role,
      scopes: principal.scopes ?? [],
      workspaces: await this.orgAccess.listWorkspaces(principal.organizationId),
    };
  }
}
