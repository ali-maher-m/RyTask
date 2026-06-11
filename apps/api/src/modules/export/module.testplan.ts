import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the export module (M5, §14.2, Principle V). `scripts/check-required-tests.ts`
 * fails the build if any declared file is MISSING.
 *
 * `mcpTools: []` is a DOCUMENTED v1 deferral (BRD §5.1 — the MVP MCP tool surface does not
 * include workspace export; BRD §5.2 defers the certified-parity gate to v2). Recorded by
 * omission + this comment — the M2/M3/M4 mechanism — so `check-mcp-parity` stays green at 49/49.
 *
 * `tenantScopedTables` is empty by design: this module OWNS no tables (a read-model over the
 * shared schema, the M4 reporting precedent); its cross-tenant isolation is asserted by the
 * dedicated tenancy spec below.
 */
export const testPlan: ModuleTestPlan = {
  module: 'export',
  providers: ['WorkspaceExportProvider'],
  controllers: [
    {
      controller: 'ExportController',
      routes: ['GET /export/workspace'],
    },
  ],
  policies: [
    // RFC-4180 CSV serialization for the two tabular cores.
    'export-csv',
  ],
  mcpTools: [],
  tenantScopedTables: [],
  requiredTests: [
    {
      kind: 'unit',
      target: 'export-csv',
      file: 'domain/export-csv.spec.ts',
    },
    // The archive (integration, real Postgres): every seeded entity class present with correct
    // counts; soft-deleted rows included with deletedAt.
    {
      kind: 'integration',
      target: 'WorkspaceExportProvider',
      file: 'providers/workspace-export.provider.int.spec.ts',
    },
    // Cross-tenant isolation: two orgs, each archive contains ONLY its own rows (FR-TEN-001).
    {
      kind: 'tenancy',
      target: 'workspace export cross-tenant isolation',
      file: 'repositories/export.tenancy.spec.ts',
    },
    // HTTP contract: OWNER/ADMIN only (403 below), JSON + CSV shapes, 400 on bad params.
    {
      kind: 'contract',
      target: 'ExportController',
      file: 'controllers/export.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
