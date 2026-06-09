import { Controller, Get, Query } from '@nestjs/common';
import {
  type ItemRollupResponse,
  type TimeRollupQuery,
  type TimeSummaryQuery,
  type TimeSummaryResponse,
  timeRollupQuerySchema,
  timeSummaryQuerySchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { TimeRollupProvider } from '../providers/time-rollup.provider';
import { TimeSummaryProvider } from '../providers/time-summary.provider';

/**
 * Time aggregation REST surface (contracts/time-rest.md §Aggregation) under /api/v1/time. US2 ships
 * the per-item rollup that feeds the row meter; US7 adds `GET /time/summary` (grouped totals + the
 * planned/interruption split that powers the "my time" view). `work:read` gates every route; the
 * tenant is resolved server-side. Aggregation is query-only — every total is a pure `SUM(duration_seconds)`.
 */
@RequirePermission('work:read')
@Controller('time')
export class TimeSummaryController {
  constructor(
    private readonly rollup: TimeRollupProvider,
    private readonly summary: TimeSummaryProvider,
  ) {}

  @Get('rollup')
  async projectRollup(
    @Query(new ZodValidationPipe<TimeRollupQuery>(timeRollupQuerySchema)) query: TimeRollupQuery,
  ): Promise<ItemRollupResponse> {
    return { data: await this.rollup.getProjectRollup(query.projectId) };
  }

  @Get('summary')
  async timeSummary(
    @Query(new ZodValidationPipe<TimeSummaryQuery>(timeSummaryQuerySchema)) query: TimeSummaryQuery,
  ): Promise<TimeSummaryResponse> {
    return { data: await this.summary.getSummary(query) };
  }
}
