/**
 * Architecture-boundary rules (ARCHITECTURE.md §3 module boundaries, §16 CI gate).
 * Run via `pnpm check:boundaries`. These are enforced in CI, not by convention.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-internals',
      comment:
        'A module may only reach another module through its public *.contract.ts (or its ' +
        "events/). Importing another module's services/providers/repositories/domain is " +
        'forbidden (ARCHITECTURE §3.1, §16.1).',
      severity: 'error',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/[^/]+/',
        pathNot: [
          '^apps/api/src/modules/$1/', // same module ($1 = the from module): allowed
          '\\.contract\\.ts$', // any module's public contract: allowed
          '^apps/api/src/modules/[^/]+/events/', // any module's published events: allowed
        ],
      },
    },
    {
      name: 'no-raw-db-outside-repositories',
      comment:
        'Tenant-scoped DB access must go through a repository extending TenantScopedRepository. ' +
        'Direct @rytask/db imports are only allowed in repositories/, common/database/, ' +
        'common/tenancy/ (ARCHITECTURE §4.2 — raw, unscoped Drizzle access is forbidden).',
      severity: 'error',
      from: {
        path: '^apps/api/src/',
        pathNot: ['repositories/', 'common/database/', 'common/tenancy/', '\\.module\\.ts$'],
      },
      to: { path: '(^|/)packages/db/' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make modules non-extractable.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Boundary rules are path-based; resolve TS imports with enhanced-resolve rather
    // than invoking the TS compiler (avoids monorepo tsconfig-extends resolution issues).
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
  },
};
