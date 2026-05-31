import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the health module (ARCHITECTURE §14.2). The build fails if any
 * `file` below is missing. This is the working seam the rest of M0+ extends.
 */
export const testPlan: ModuleTestPlan = {
  module: 'health',
  providers: ['HealthService', 'HealthRepository'],
  controllers: [{ controller: 'HealthController', routes: ['GET /healthz', 'GET /readyz'] }],
  policies: ['health.policy'],
  mcpTools: [],
  tenantScopedTables: [],
  requiredTests: [
    { kind: 'unit', target: 'health.policy', file: 'domain/health.policy.spec.ts' },
    {
      kind: 'contract',
      target: 'HealthController',
      file: 'controllers/health.controller.contract.spec.ts',
    },
    {
      kind: 'integration',
      target: 'HealthRepository',
      file: 'repositories/health.repository.int.spec.ts',
    },
  ],
};

export default testPlan;
