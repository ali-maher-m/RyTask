import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type ProjectAccessService, type ProjectRole, roleSatisfies } from '../projects.contract';
import { ProjectMembersRepository } from '../repositories/project-members.repository';

/**
 * Project authorization (RBAC matrix, contracts/README.md). Org admins bypass project
 * membership; otherwise the principal must hold a role that satisfies the requirement.
 * Identity comes from the tenant context (the principal resolved by M0's AuthGuard).
 */
@Injectable()
export class ProjectAccessServiceImpl implements ProjectAccessService {
  constructor(
    private readonly members: ProjectMembersRepository,
    private readonly tenant: TenantContextService,
  ) {}

  private currentUserId(): string {
    const userId = this.tenant.getUserId();
    if (!userId) {
      throw new UnauthorizedException('No authenticated principal');
    }
    return userId;
  }

  async getRole(projectId: string): Promise<ProjectRole | null> {
    if (this.tenant.get().isOrgAdmin) {
      return 'ADMIN';
    }
    return this.members.findRole(projectId, this.currentUserId());
  }

  async assertRole(projectId: string, required: ProjectRole): Promise<void> {
    if (this.tenant.get().isOrgAdmin) {
      return;
    }
    const role = await this.members.findRole(projectId, this.currentUserId());
    if (!role || !roleSatisfies(role, required)) {
      throw new ForbiddenException(`Requires project role ${required} (held: ${role ?? 'none'})`);
    }
  }

  async accessibleProjectIds(): Promise<string[]> {
    return this.members.listProjectIdsForUser(this.currentUserId());
  }
}
