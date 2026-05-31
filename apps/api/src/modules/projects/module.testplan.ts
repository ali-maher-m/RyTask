import type { ModuleTestPlan } from '../../common/testing/testplan';

/** REQUIRED tests for the projects module (§14.2). Appended per user story (US3, US4). */
export const testPlan: ModuleTestPlan = {
  module: 'projects',
  providers: [
    'StatusesProvider',
    'StatusesService',
    'CreateProjectProvider',
    'ListProjectsProvider',
    'GetProjectProvider',
    'UpdateProjectProvider',
    'ArchiveProjectProvider',
    'DeleteProjectProvider',
    'MembershipProvider',
    'ProjectsService',
  ],
  controllers: [
    {
      controller: 'StatusesController',
      routes: [
        'GET /projects/{projectId}/statuses',
        'POST /projects/{projectId}/statuses',
        'POST /projects/{projectId}/statuses/reorder',
        'PATCH /statuses/{statusId}',
        'DELETE /statuses/{statusId}',
      ],
    },
    {
      controller: 'ProjectsController',
      routes: [
        'GET /projects',
        'POST /projects',
        'GET /projects/{projectId}',
        'PATCH /projects/{projectId}',
        'DELETE /projects/{projectId}',
        'GET /projects/{projectId}/members',
        'POST /projects/{projectId}/members',
      ],
    },
  ],
  policies: ['status.policy', 'project.policy'],
  mcpTools: [
    'list_statuses',
    'create_status',
    'update_status',
    'reorder_statuses',
    'delete_status',
    'list_projects',
    'get_project',
    'create_project',
    'update_project',
    'archive_project',
    'delete_project',
    'add_project_member',
  ],
  tenantScopedTables: ['projects', 'project_members', 'project_counters', 'statuses'],
  requiredTests: [
    // US3 — customizable statuses
    { kind: 'unit', target: 'status.policy', file: 'domain/status.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'StatusesProvider',
      file: 'providers/statuses.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'statuses',
      file: 'repositories/statuses.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'StatusesController',
      file: 'controllers/statuses.controller.contract.spec.ts',
    },
    // US4 — projects + membership + My Work
    { kind: 'unit', target: 'project.policy', file: 'domain/project.policy.spec.ts' },
    {
      kind: 'integration',
      target: 'CreateProjectProvider',
      file: 'providers/create-project.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'MembershipProvider',
      file: 'providers/membership.provider.int.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'projects/project_members',
      file: 'repositories/projects.tenancy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'ProjectsController',
      file: 'controllers/projects.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
