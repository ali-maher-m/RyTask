import type { ModuleTestPlan } from '../../common/testing/testplan';

/** REQUIRED tests for the search module (§14.2). Read-only over other modules' tsvectors; appended in US8. */
export const testPlan: ModuleTestPlan = {
  module: 'search',
  providers: ['SearchProvider', 'SearchService'],
  controllers: [
    {
      controller: 'SearchController',
      routes: ['GET /search'],
    },
  ],
  policies: [],
  mcpTools: ['search'],
  // The search module owns NO tables (data-model §4) — it reads other modules' tsvectors.
  tenantScopedTables: [],
  requiredTests: [
    // US8 — permission-aware full-text search (D8, FR-SRCH-001/004)
    {
      kind: 'integration',
      target: 'SearchProvider',
      file: 'providers/search.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'SearchController',
      file: 'controllers/search.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
