import { Global, Module } from '@nestjs/common';
import { InvitesController } from './controllers/invites.controller';
import { MembershipsController } from './controllers/memberships.controller';
import { OrgsController } from './controllers/orgs.controller';
import { SetupController } from './controllers/setup.controller';
import { WorkspacesController } from './controllers/workspaces.controller';
import { ORG_ACCESS } from './orgs.contract';
import { AcceptInviteProvider } from './providers/accept-invite.provider';
import { BootstrapFirstRunProvider } from './providers/bootstrap-first-run.provider';
import { GetOrgProvider } from './providers/get-org.provider';
import { InviteProvider } from './providers/invite.provider';
import { MemberAdminProvider } from './providers/member-admin.provider';
import { WorkspacesProvider } from './providers/workspaces.provider';
import { BootstrapRepository } from './repositories/bootstrap.repository';
import { InvitationsRepository } from './repositories/invitations.repository';
import { MembershipsRepository } from './repositories/memberships.repository';
import { OrganizationsRepository } from './repositories/organizations.repository';
import { WorkspacesRepository } from './repositories/workspaces.repository';
import { AccessServiceImpl } from './services/access.service';
import { OrgsService } from './services/orgs.service';
import { WorkspacesService } from './services/workspaces.service';

/**
 * Orgs bounded context (data-model §4): owns `organizations` (settings), `workspaces`,
 * `memberships`, `invitations` — tenancy root, roles, invites, first-run onboarding,
 * member administration. `@Global` so the cross-module `ORG_ACCESS` role-resolution port is
 * injectable via its token (Principle III). US1 wires setup/orgs/workspaces; US3 invitations;
 * US4 the role policy + guard; US8 member admin.
 */
@Global()
@Module({
  controllers: [
    SetupController,
    OrgsController,
    WorkspacesController,
    InvitesController,
    MembershipsController,
  ],
  providers: [
    OrganizationsRepository,
    WorkspacesRepository,
    MembershipsRepository,
    InvitationsRepository,
    BootstrapRepository,
    BootstrapFirstRunProvider,
    GetOrgProvider,
    WorkspacesProvider,
    InviteProvider,
    AcceptInviteProvider,
    MemberAdminProvider,
    OrgsService,
    WorkspacesService,
    AccessServiceImpl,
    { provide: ORG_ACCESS, useExisting: AccessServiceImpl },
  ],
  exports: [ORG_ACCESS],
})
export class OrgsModule {}
