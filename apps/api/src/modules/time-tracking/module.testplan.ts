import type { ModuleTestPlan } from '../../common/testing/testplan';

/**
 * REQUIRED tests for the time-tracking module (§14.2). Appended per user story
 * (US1–US8, T028/T039/T049/T059/T065/T077/T082). `scripts/check-required-tests.ts`
 * fails the build when any declared `requiredTests[].file` is missing.
 *
 * `mcpTools` lists the five time-control tools the MCP edge exposes for this module (AC-9, BRD §5):
 * start/stop/get-active timer, log time, and the report overview. They call the SAME providers as
 * REST and stamp `source = MCP` on writes; the per-tool contract test lives in the MCP edge's plan
 * (`apps/api/src/mcp/mcp.testplan.ts`), and `check-mcp-parity` covers the matching capabilities.
 * (The earlier Slack/MCP time-control deferral was lifted to honor the BRD's v1 MCP tool set.)
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
    // M4 US1 — the flagship "Where did my time go?" overview read-model
    'ReportOverviewProvider',
    // M4 US2 — the interruption ledger (the evidence behind the headline number)
    'InterruptionLedgerProvider',
    // M4 US3 — the personal weekly summary ("My week")
    'WeeklySummaryProvider',
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
    // M4 reporting — three read-only routes over the M2 spine (US1/US2/US3).
    {
      controller: 'TimeReportsController',
      routes: [
        'GET /time/reports/overview',
        'GET /time/reports/interruptions',
        'GET /time/reports/week',
      ],
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
  // AC-9 — the time-control tools the MCP edge exposes for this module (BRD §5 MVP tool set). Each
  // maps 1:1 to a `timeTracking.*` capability in `scripts/check-mcp-parity.ts`; the per-tool contract
  // test is declared in `apps/api/src/mcp/mcp.testplan.ts` (the edge owns the MCP wiring + tests).
  mcpTools: ['start_timer', 'stop_timer', 'get_active_timer', 'log_time', 'time_report'],
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
    // M4 US1 — the flagship overview route (contract) + read-model (integration, real Postgres).
    {
      kind: 'contract',
      target: 'TimeReportsController',
      file: 'controllers/time-reports.controller.contract.spec.ts',
    },
    {
      kind: 'integration',
      target: 'ReportOverviewProvider',
      file: 'providers/report-overview.provider.int.spec.ts',
    },
    // M4 US2 — the interruption ledger (real Postgres): rows/weeks, reporter-null, reconciliation.
    {
      kind: 'integration',
      target: 'InterruptionLedgerProvider',
      file: 'providers/interruption-ledger.provider.int.spec.ts',
    },
    // M4 US3 — the personal weekly summary (real Postgres): totals/items/completed + summary reconcile.
    {
      kind: 'integration',
      target: 'WeeklySummaryProvider',
      file: 'providers/weekly-summary.provider.int.spec.ts',
    },
    // M4 Polish — the SC-002/SC-003 cross-surface reconciliation authority (two orgs, all 3 endpoints
    // + /time/summary; planned + interruption === logged and overview interruption === ledger total).
    {
      kind: 'integration',
      target: 'reports cross-surface reconciliation (SC-002/SC-003)',
      file: 'reports-reconciliation.int.spec.ts',
    },
    // M4 Polish — cross-tenant isolation for the new ledger/weekly read-models (Principle II).
    {
      kind: 'tenancy',
      target: 'reports read-models cross-tenant isolation',
      file: 'reports-tenancy.int.spec.ts',
    },
  ],
};

export default testPlan;
