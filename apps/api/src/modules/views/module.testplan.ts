import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the views module (§14.2). The shared query engine (filter
 * compiler, keyset cursor, validator) is foundational; US5 adds the smart-view registry
 * and the saved-views CRUD surface (controllers, providers, repository, tenancy).
 */
export const testPlan: ModuleTestPlan = {
  module: 'views',
  providers: ['save-view', 'update-view', 'delete-view', 'list-views', 'filtered-list'],
  controllers: [
    {
      controller: 'ViewsController',
      routes: ['GET /views', 'POST /views', 'PATCH /views/{id}', 'DELETE /views/{id}'],
    },
  ],
  policies: ['query-compiler', 'filter-validator', 'smart-views'],
  mcpTools: ['list_views', 'save_view', 'update_view', 'delete_view'],
  tenantScopedTables: ['views'],
  requiredTests: [
    { kind: 'unit', target: 'query-compiler', file: 'domain/query-compiler.spec.ts' },
    { kind: 'unit', target: 'query-cursor', file: 'domain/query-cursor.spec.ts' },
    { kind: 'unit', target: 'filter-validator', file: 'domain/filter-validator.spec.ts' },
    // US5 — smart views + saved-views CRUD/visibility.
    { kind: 'unit', target: 'smart-views', file: 'domain/smart-views.spec.ts' },
    {
      kind: 'integration',
      target: 'filtered-list',
      file: 'providers/filtered-list.provider.int.spec.ts',
    },
    { kind: 'integration', target: 'views-crud', file: 'providers/views.provider.int.spec.ts' },
    { kind: 'tenancy', target: 'views', file: 'repositories/views.tenancy.spec.ts' },
    {
      kind: 'contract',
      target: 'ViewsController',
      file: 'controllers/views.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
