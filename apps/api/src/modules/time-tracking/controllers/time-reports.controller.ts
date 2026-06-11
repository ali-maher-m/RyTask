import { Controller, Get, Query } from '@nestjs/common';
import {
  type InterruptionLedgerResponse,
  type ReportOverviewResponse,
  type ReportRangeQuery,
  type ReportWeekQuery,
  type WeeklySummaryResponse,
  reportRangeQuerySchema,
  reportWeekQuerySchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { InterruptionLedgerProvider } from '../providers/interruption-ledger.provider';
import { ReportOverviewProvider } from '../providers/report-overview.provider';
import { WeeklySummaryProvider } from '../providers/weekly-summary.provider';

/**
 * M4 reporting REST surface (contracts/reports-rest.md) under `/api/v1/time/reports` — three
 * read-only routes over the M2 aggregation spine: the flagship `overview` (US1), the
 * `interruptions` ledger (US2), and `week` (US3). `work:read` gates every route; the tenant is
 * resolved server-side (`TenantGuard`); visibility is scoped per route to the caller's readable
 * projects (`assertRole(VIEWER)` when `projectId` is supplied, else `accessibleProjectIds()`).
 * Read-only by contract (FR-015): no writes, no activity, no notifications, no idempotency surface.
 *
 * No MCP tool — reports-via-API/MCP is FR-RPT-009 (v2); the registry stays 49/49.
 */
@RequirePermission('work:read')
@Controller('time/reports')
export class TimeReportsController {
  constructor(
    private readonly overview: ReportOverviewProvider,
    private readonly ledger: InterruptionLedgerProvider,
    private readonly weekly: WeeklySummaryProvider,
  ) {}

  @Get('overview')
  async reportOverview(
    @Query(new ZodValidationPipe<ReportRangeQuery>(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<ReportOverviewResponse> {
    return { data: await this.overview.getOverview(query) };
  }

  @Get('interruptions')
  async interruptions(
    @Query(new ZodValidationPipe<ReportRangeQuery>(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<InterruptionLedgerResponse> {
    return { data: await this.ledger.getLedger(query) };
  }

  @Get('week')
  async weekSummary(
    @Query(new ZodValidationPipe<ReportWeekQuery>(reportWeekQuerySchema)) query: ReportWeekQuery,
  ): Promise<WeeklySummaryResponse> {
    return { data: await this.weekly.getWeek(query) };
  }
}
