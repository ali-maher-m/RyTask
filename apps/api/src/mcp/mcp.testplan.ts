import type { ModuleTestPlan } from '../common/testing/testplan';

/**
 * REQUIRED tests for the MCP transport edge (§14.2, Principle V). `scripts/check-required-tests.ts`
 * fails the build if any declared file is MISSING. The edge owns no domain — the 49 tools live in
 * `@rytask/contracts`' registry and `check-mcp-parity` keeps that surface green at 49/49. US4
 * (T065–T077) adds: PAT-auth + capture + tenant-isolation integration tests (real Postgres), the
 * pagination + context contract tests, and the 7 grouped per-tool contract tests that together cover
 * all 49 tools (every MCP tool → a contract test, FR-X-002).
 */
export const testPlan: ModuleTestPlan = {
  module: 'mcp',
  providers: ['McpAuth', 'McpToolDispatcher', 'McpToolRegistrar', 'ContextTools'],
  requiredTests: [
    // Auth + tenant safety (real Postgres).
    { kind: 'integration', target: 'McpAuth', file: 'mcp-auth.int.spec.ts' },
    {
      kind: 'tenancy',
      target: 'mcp cross-tenant isolation',
      file: 'mcp-tenant-isolation.int.spec.ts',
    },
    // Capture + pagination behaviour.
    {
      kind: 'integration',
      target: 'mcp capture (source=MCP)',
      file: 'tools/mcp-capture.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'mcp pagination',
      file: 'tools/mcp-pagination.contract.spec.ts',
    },
    // Per-tool contract tests — together cover all 49 registry tools.
    { kind: 'contract', target: 'context tools (4)', file: 'tools/context-tools.contract.spec.ts' },
    {
      kind: 'contract',
      target: 'work-items + labels tools (14)',
      file: 'tools/work-items-tools.contract.spec.ts',
    },
    {
      kind: 'contract',
      target: 'projects tools (7)',
      file: 'tools/projects-tools.contract.spec.ts',
    },
    {
      kind: 'contract',
      target: 'statuses tools (5)',
      file: 'tools/statuses-tools.contract.spec.ts',
    },
    { kind: 'contract', target: 'views tools (4)', file: 'tools/views-tools.contract.spec.ts' },
    { kind: 'contract', target: 'collab tools (4)', file: 'tools/collab-tools.contract.spec.ts' },
    { kind: 'contract', target: 'search tool (1)', file: 'tools/search-tool.contract.spec.ts' },
    {
      kind: 'contract',
      target: 'org + membership tools (7)',
      file: 'tools/org-tools.contract.spec.ts',
    },
    { kind: 'contract', target: 'pat tools (3)', file: 'tools/token-tools.contract.spec.ts' },
    // US8 — categorized errors with no partial mutation (T106).
    {
      kind: 'contract',
      target: 'mcp categorized errors',
      file: 'mcp-errors.contract.spec.ts',
    },
  ],
};

export default testPlan;
