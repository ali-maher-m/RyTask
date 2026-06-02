import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the orgs module (§14.2, Principle V). `requiredTests` is appended per
 * user story (repo convention): US1 (first-run), US3 (invitations), US4 (role policy), US8
 * (member admin). The metadata below documents the full surface the milestone covers.
 */
export const testPlan: ModuleTestPlan = {
  module: 'orgs',
  providers: [
    'BootstrapFirstRunProvider',
    'GetOrgProvider',
    'WorkspacesProvider',
    'InviteProvider',
    'AcceptInviteProvider',
    'MemberAdminProvider',
    'AccessServiceImpl',
  ],
  controllers: [
    { controller: 'SetupController', routes: ['GET /setup', 'POST /setup'] },
    {
      controller: 'OrgsController',
      routes: [
        'GET /orgs/current',
        'PATCH /orgs/current',
        'DELETE /orgs/current',
        'POST /orgs/current/transfer-ownership',
      ],
    },
    {
      controller: 'WorkspacesController',
      routes: ['GET /workspaces', 'GET /workspaces/{id}'],
    },
    {
      controller: 'MembershipsController',
      routes: ['GET /memberships', 'PATCH /memberships/{userId}', 'DELETE /memberships/{userId}'],
    },
    {
      controller: 'InvitesController',
      routes: [
        'GET /invites',
        'POST /invites',
        'GET /invites/{token}',
        'POST /invites/{token}/accept',
        'DELETE /invites/{id}/_revoke',
      ],
    },
  ],
  policies: ['bootstrap.policy', 'role.policy', 'last-owner.policy', 'invitation.policy'],
  mcpTools: [
    'list_workspaces',
    'get_workspace',
    'set_active_workspace',
    'get_org_settings',
    'update_org_settings',
    'list_members',
    'invite_member',
    'set_member_role',
    'remove_member',
    'transfer_ownership',
  ],
  tenantScopedTables: ['organizations', 'workspaces', 'memberships', 'invitations'],
  requiredTests: [
    // US1 — first-run onboarding
    { kind: 'unit', target: 'bootstrap.policy', file: 'domain/bootstrap.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'BootstrapFirstRunProvider',
      file: 'providers/bootstrap-first-run.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'SetupController',
      file: 'controllers/setup.controller.contract.spec.ts',
    },
    { kind: 'tenancy', target: 'memberships', file: 'repositories/memberships.tenancy.spec.ts' },
    // US3 — invitations
    { kind: 'unit', target: 'invitation.policy', file: 'domain/invitation.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'InviteProvider',
      file: 'providers/invite.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'InvitesController',
      file: 'controllers/invites.controller.contract.spec.ts',
    },
    { kind: 'tenancy', target: 'invitations', file: 'repositories/invitations.tenancy.spec.ts' },
    // US4 — RBAC enforcement
    { kind: 'unit', target: 'role.policy', file: 'domain/role.policy.spec.ts' },
    // US8 — member + org administration
    { kind: 'unit', target: 'last-owner.policy', file: 'domain/last-owner.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'MemberAdminProvider',
      file: 'providers/member-admin.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'MembershipsController',
      file: 'controllers/member-admin.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
