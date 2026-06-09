import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the time-tracking module (§14.2). Appended per user story
 * (US1–US8, T028/T039/T049/T059/T065/T077/T082). `scripts/check-required-tests.ts`
 * fails the build when any declared `requiredTests[].file` is missing.
 *
 * `mcpTools: []` is a DOCUMENTED v2 deferral (Principle IV / FR-FIN-004, research D12):
 * time-*control* via MCP/Slack is v2, so M2 registers ZERO time tools and `check-mcp-parity`
 * stays green at 49/49 by omission (byte-for-byte the M3 mechanism). The `providers` /
 * `controllers` / `policies` / `requiredTests` arrays grow as each story lands.
 */
export const testPlan: ModuleTestPlan = {
  module: 'time-tracking',
  providers: [
    // US1 — the live timer
    'StartTimerProvider',
    'StopTimerProvider',
    'GetActiveTimerProvider',
    // US2 — the signature meter's read-model
    'TimeRollupProvider',
    // US3 — manual entries (the after-the-fact log)
    'CreateTimeLogProvider',
    'ListTimeLogsProvider',
    // US4 — correct & audit (owner-or-admin edit/delete)
    'UpdateTimeLogProvider',
    'DeleteTimeLogProvider',
    // US7 — grouped totals + planned/interruption split (the "my time" read-model)
    'TimeSummaryProvider',
  ],
  controllers: [
    {
      controller: 'TimersController',
      routes: [
        'POST /work-items/{workItemId}/timer/start',
        'POST /timers/{id}/stop',
        'GET /timers/active',
      ],
    },
    {
      controller: 'TimeLogsController',
      routes: [
        'POST /work-items/{workItemId}/time-logs',
        'GET /work-items/{workItemId}/time-logs',
        'PATCH /time-logs/{id}',
        'DELETE /time-logs/{id}',
      ],
    },
    {
      controller: 'TimeSummaryController',
      routes: ['GET /time/rollup', 'GET /time/summary'],
    },
  ],
  policies: [
    // US1 — at most one active timer per user
    'one-active-timer.policy',
    // US3 — manual-entry duration validation (the two forms + the invalid forms)
    'duration.policy',
    // US4 — owner-or-admin edit/delete (default-deny)
    'time-edit-permission.policy',
    // US5 — planned vs interruption (priority baseline + override precedence)
    'classification.policy',
  ],
  mcpTools: [],
  tenantScopedTables: ['timers', 'time_logs'],
  requiredTests: [
    // US1 — the live timer (start/switch/stop, server-CLOCK truth, reload/restart, idempotent replay)
    {
      kind: 'unit',
      target: 'one-active-timer.policy',
      file: 'domain/one-active-timer.policy.spec.ts',
    },
    {
      kind: 'contract',
      target: 'TimersController',
      file: 'controllers/timers.controller.contract.spec.ts',
    },
    {
      kind: 'integration',
      target: 'StartTimerProvider',
      file: 'providers/start-timer.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'StopTimerProvider',
      file: 'providers/stop-timer.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'GetActiveTimerProvider',
      file: 'providers/get-active-timer.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'timer lifecycle (reload/restart + idempotent replay)',
      file: 'timer-lifecycle.int.spec.ts',
    },
    // US2 — the per-item rollup that feeds the in-row plan-vs-actual meter
    {
      kind: 'integration',
      target: 'TimeRollupProvider',
      file: 'providers/time-rollup.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'TimeSummaryController',
      file: 'controllers/time-summary.controller.contract.spec.ts',
    },
    // US3 — manual entries (duration policy, create/list providers, the two time-log routes)
    {
      kind: 'unit',
      target: 'duration.policy',
      file: 'domain/duration.policy.spec.ts',
    },
    {
      kind: 'integration',
      target: 'CreateTimeLogProvider',
      file: 'providers/create-time-log.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'ListTimeLogsProvider',
      file: 'providers/list-time-logs.provider.int.spec.ts',
    },
    {
      kind: 'contract',
      target: 'TimeLogsController',
      file: 'controllers/time-logs.controller.contract.spec.ts',
    },
    // US4 — owner-or-admin edit/delete (permission policy + update/delete providers; the contract
    // spec above is extended in-place with PATCH/DELETE + the non-owner 403)
    {
      kind: 'unit',
      target: 'time-edit-permission.policy',
      file: 'domain/time-edit-permission.policy.spec.ts',
    },
    {
      kind: 'integration',
      target: 'UpdateTimeLogProvider',
      file: 'providers/update-time-log.provider.int.spec.ts',
    },
    {
      kind: 'integration',
      target: 'DeleteTimeLogProvider',
      file: 'providers/delete-time-log.provider.int.spec.ts',
    },
    // US5 — planned/interruption classification (priority baseline, override precedence, snapshot
    // holds through a later priority change, planned + interruption reconcile to the total)
    {
      kind: 'unit',
      target: 'classification.policy',
      file: 'domain/classification.policy.spec.ts',
    },
    {
      kind: 'integration',
      target: 'classification (derive/snapshot/override/reconcile)',
      file: 'classification.int.spec.ts',
    },
    // US6 — time events woven into the existing M1 activity feed via the work-items contract
    {
      kind: 'integration',
      target: 'time activity feed (TIME_* via the work-items contract, interleaved)',
      file: 'time-activity.int.spec.ts',
    },
    // US7 — grouped-totals reconciliation across item/user/project/period + planned/interruption split
    // (the contract spec above is extended in-place with GET /time/summary)
    {
      kind: 'integration',
      target: 'TimeSummaryProvider',
      file: 'providers/time-summary.provider.int.spec.ts',
    },
    // US8 — cross-tenant isolation for both new tables + idempotent/replay-safe + concurrency-safe writes
    {
      kind: 'tenancy',
      target: 'timers',
      file: 'repositories/timers.tenancy.spec.ts',
    },
    {
      kind: 'tenancy',
      target: 'time_logs',
      file: 'repositories/time-logs.tenancy.spec.ts',
    },
    {
      kind: 'integration',
      target: 'idempotency + concurrency (replay = one entry, concurrent start = one timer)',
      file: 'idempotency-concurrency.int.spec.ts',
    },
  ],
};

export default testPlan;
