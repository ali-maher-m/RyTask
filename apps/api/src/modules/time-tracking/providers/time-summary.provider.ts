import { Inject, Injectable } from '@nestjs/common';
import type { TimeSummaryQuery, TimeSummaryRow } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * Grouped time totals — the aggregation read-model behind `GET /time/summary` (US7, research D10).
 * Every total is a pure tenant-scoped `SUM(duration_seconds)` grouped by the requested axis (item /
 * user / project / day|week period) and split planned vs interruption, so it reconciles EXACTLY to the
 * contributing entries (`planned + interruption === logged`, SC-005) and powers the "my time
 * today/this week" view (`userId = principal.userId`). `work:read` is enforced at the route; when a
 * `projectId` is supplied this additionally asserts the caller can view that project (org admins
 * bypass) — the rollup/read pattern. The org boundary always holds via `TenantScopedRepository`.
 */
@Injectable()
export class TimeSummaryProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
  ) {}

  async getSummary(params: TimeSummaryQuery): Promise<TimeSummaryRow[]> {
    if (params.projectId) {
      await this.projects.assertRole(params.projectId, 'VIEWER');
    }
    return this.timeLogs.summarize(params);
  }
}
