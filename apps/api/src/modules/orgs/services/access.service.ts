import { Injectable } from '@nestjs/common';
import type { Role, Workspace } from '@rytask/contracts';
import { isOrgAdminRole } from '../../../common/rbac/permissions';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import type { OrgAccessService, SignupContext } from '../orgs.contract';
import { toWorkspaceDto } from '../providers/org.mapper';
import { MembershipsRepository } from '../repositories/memberships.repository';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { WorkspacesRepository } from '../repositories/workspaces.repository';

/**
 * Org access resolution (data-model §4, research D6). Resolves a user's role from
 * `memberships`. Because callers may need a role **before** a request's tenant context
 * exists (token verification in the middleware, login before ALS), the lookups establish a
 * transient ALS scope so the tenant-scoped repository targets the right org. US4 wires this
 * into `RbacGuard`; US2 uses it at login to stamp the role into the access token.
 */
@Injectable()
export class AccessServiceImpl implements OrgAccessService {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly workspaces: WorkspacesRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly tenant: TenantContextService,
  ) {}

  getRoleForUser(organizationId: string, userId: string): Promise<Role | null> {
    return this.tenant.run({ organizationId }, () => this.memberships.findRole(userId));
  }

  async isActiveMember(organizationId: string, userId: string): Promise<boolean> {
    return (await this.getRoleForUser(organizationId, userId)) !== null;
  }

  isOrgAdminRole(role: Role): boolean {
    return isOrgAdminRole(role);
  }

  async getDefaultWorkspaceId(organizationId: string): Promise<string | null> {
    const rows = await this.tenant.run({ organizationId }, () => this.workspaces.list());
    return rows[0]?.id ?? null;
  }

  async listWorkspaces(organizationId: string): Promise<Workspace[]> {
    const rows = await this.tenant.run({ organizationId }, () => this.workspaces.list());
    return rows.map(toWorkspaceDto);
  }

  async getSignupContext(): Promise<SignupContext | null> {
    const org = await this.organizations.first();
    if (!org) {
      return null;
    }
    return {
      organizationId: org.id,
      allowPublicSignup: org.settings?.allowPublicSignup === true,
      defaultWorkspaceId: await this.getDefaultWorkspaceId(org.id),
    };
  }

  async addMember(organizationId: string, userId: string, role: Role): Promise<void> {
    await this.memberships.create({ organizationId, userId, role });
  }
}
