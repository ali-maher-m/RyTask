import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the GitHub module (M5, §14.2, Principle V). `scripts/check-required-tests.ts`
 * fails the build if any declared file is MISSING.
 *
 * `mcpTools: []` is a DOCUMENTED v1 deferral (BRD §5.1 — the MVP MCP tool surface includes
 * neither GitHub administration nor webhook plumbing; BRD §5.2 defers the certified-parity gate
 * to v2). The deferral is recorded by omission (no `serviceCapabilities` entry) + this comment —
 * byte-for-byte the M2/M3/M4 mechanism — so `check-mcp-parity` stays green at 49/49.
 */
export const testPlan: ModuleTestPlan = {
  module: 'github',
  providers: [
    // US1 — connection lifecycle (mint secret → encrypt → store; soft revoke; list).
    'ConnectGithubProvider',
    'DisconnectGithubProvider',
    'ListGithubConnectionsProvider',
    // US1 — the worker that turns a verified delivery into links + activity.
    'GithubLinkProcessor',
  ],
  controllers: [
    {
      controller: 'GithubWebhookController',
      routes: ['POST /integrations/github/webhook/{connectionId}'],
    },
    {
      controller: 'GithubAdminController',
      routes: [
        'GET /integrations/github',
        'POST /integrations/github',
        'DELETE /integrations/github/{connectionId}',
      ],
    },
  ],
  policies: [
    // HMAC-SHA256 over the raw bytes, constant-time, fail-closed.
    'github-signature.policy',
    // Bare + magic-worded key extraction, normalization, dedupe, fan-out cap.
    'magic-words.parser',
  ],
  mcpTools: [],
  tenantScopedTables: ['github_connections', 'github_links'],
  requiredTests: [
    // Domain policies (unit).
    {
      kind: 'unit',
      target: 'github-signature.policy',
      file: 'domain/github-signature.policy.spec.ts',
    },
    {
      kind: 'unit',
      target: 'magic-words.parser',
      file: 'domain/magic-words.parser.spec.ts',
    },
    // Tenancy isolation for both new tables (FR-TEN-001).
    {
      kind: 'tenancy',
      target: 'github_connections',
      file: 'repositories/github-connections.tenancy.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'github_links',
      file: 'repositories/github-links.tenancy.spec.ts',
    },
    // Connection lifecycle (integration, real Postgres): encrypt-at-rest, rotate-on-reconnect,
    // soft revoke.
    {
      kind: 'integration',
      target: 'ConnectGithubProvider / ListGithubConnectionsProvider',
      file: 'providers/connect-github.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'DisconnectGithubProvider',
      file: 'providers/disconnect-github.provider.int.spec.ts',
    },
    // The linking worker (integration, real Postgres): commit + PR magic words → link + activity,
    // replay-idempotent (FR-INT-GH-007), revoked/mismatched-repo no-ops.
    {
      kind: 'integration',
      target: 'GithubLinkProcessor (link + activity, idempotent on replay)',
      file: 'processors/github-link.processor.int.spec.ts',
    },
    // HTTP contract: signature-verified edge (401 forged/unknown, 202 + one enqueue, ignores).
    {
      kind: 'contract',
      target: 'GithubWebhookController',
      file: 'controllers/github-webhook.controller.contract.spec.ts',
    },
    // HTTP contract: admin RBAC (member read, admin write, 401/403/400).
    {
      kind: 'contract',
      target: 'GithubAdminController',
      file: 'controllers/github-admin.controller.contract.spec.ts',
    },
  ],
};

export default testPlan;
