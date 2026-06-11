import { Module } from '@nestjs/common';
import { TimeLogsController } from './controllers/time-logs.controller';
import { TimeReportsController } from './controllers/time-reports.controller';
import { TimeSummaryController } from './controllers/time-summary.controller';
import { TimersController } from './controllers/timers.controller';
import { CreateTimeLogProvider } from './providers/create-time-log.provider';
import { DeleteTimeLogProvider } from './providers/delete-time-log.provider';
import { GetActiveTimerProvider } from './providers/get-active-timer.provider';
import { InterruptionLedgerProvider } from './providers/interruption-ledger.provider';
import { ListTimeLogsProvider } from './providers/list-time-logs.provider';
import { ReportOverviewProvider } from './providers/report-overview.provider';
import { StartTimerProvider } from './providers/start-timer.provider';
import { StopTimerProvider } from './providers/stop-timer.provider';
import { TimeRollupProvider } from './providers/time-rollup.provider';
import { TimeSummaryProvider } from './providers/time-summary.provider';
import { UpdateTimeLogProvider } from './providers/update-time-log.provider';
import { WeeklySummaryProvider } from './providers/weekly-summary.provider';
import { TimeLogsRepository } from './repositories/time-logs.repository';
import { TimersRepository } from './repositories/timers.repository';
import { TIME_TRACKING_ACCESS } from './time-tracking.contract';

/**
 * Time-tracking bounded context (M2, the flagship — research D1). Owns `timers` +
 * `time_logs` and mirrors the work-items module layout verbatim (controllers →
 * providers-per-operation → TenantScopedRepository → domain policies → events →
 * `module.testplan.ts`). It calls other modules ONLY via their `*.contract.ts`
 * (Principle III): item-access checks + the `recordTime*` activity append go through
 * `WORK_ITEM_ACCESS`; it never touches the `activity` table directly.
 *
 * Cross-module dependencies are injected by token from @Global modules — `WORK_ITEM_ACCESS`
 * (WorkItemsModule), `CLOCK` / `ID_GENERATOR` (PortsModule), `IdempotencyService`
 * (IdempotencyModule) — so this module imports none of them (the `comments` pattern). No new
 * dependency, no new entrypoint, no new MCP tool (49/49 holds).
 *
 * Phase 2 registered the two tenant-scoped repositories. US1 adds the timer surface
 * (`TimersController` + start/stop/get-active providers); US2 adds the aggregation surface
 * (`TimeSummaryController` + `TimeRollupProvider`) and binds the `TIME_TRACKING_ACCESS` port
 * (time-tracking.contract.ts) to the rollup impl, exporting it for future cross-module/agent reads.
 */
@Module({
  controllers: [TimersController, TimeLogsController, TimeSummaryController, TimeReportsController],
  providers: [
    TimersRepository,
    TimeLogsRepository,
    StartTimerProvider,
    StopTimerProvider,
    GetActiveTimerProvider,
    CreateTimeLogProvider,
    ListTimeLogsProvider,
    UpdateTimeLogProvider,
    DeleteTimeLogProvider,
    TimeRollupProvider,
    TimeSummaryProvider,
    ReportOverviewProvider,
    InterruptionLedgerProvider,
    WeeklySummaryProvider,
    { provide: TIME_TRACKING_ACCESS, useExisting: TimeRollupProvider },
  ],
  exports: [TIME_TRACKING_ACCESS],
})
export class TimeTrackingModule {}
