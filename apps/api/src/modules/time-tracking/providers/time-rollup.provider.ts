import { Inject, Injectable } from '@nestjs/common';
import type { ItemRollup } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { TimeLogsRepository } from '../repositories/time-logs.repository';
import type { TimeTrackingAccessService } from '../time-tracking.contract';

/**
 * Per-item logged totals for a project — the read-model that feeds the in-row plan-vs-actual meter
 * (US2, research D10/D11). Served over REST (`GET /time/rollup`) and merged with the items list
 * client-side, so work-items never reads `time_logs`. Also the impl bound to `TIME_TRACKING_ACCESS`
 * (the cross-module port) for future sibling/agent reads. `work:read` is enforced at the route; this
 * additionally asserts the caller can view the project (org admins bypass) — the work-items read pattern.
 */
@Injectable()
export class TimeRollupProvider implements TimeTrackingAccessService {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
  ) {}

  async getProjectRollup(projectId: string): Promise<ItemRollup[]> {
    await this.projects.assertRole(projectId, 'VIEWER');
    return this.timeLogs.rollupByItem(projectId);
  }
}
