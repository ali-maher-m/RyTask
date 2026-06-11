import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ReportWeekQuery, WeeklySummary } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { validateWeekStart, weekEndOf } from '../domain/report-range.policy';
import { type ReportScope, TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * "My week" — one user, one Mon–Sun week (US3, FR-RPT-007, research D6). Totals + planned/interruption
 * split, the items the subject tracked time on (with tracked-beside-estimate), and the items they
 * completed that week. `weekStart` MUST be a Monday (→ 400); `userId` defaults to the principal ("my
 * week"). The completed list comes through the work-items contract (`listCompletedForUser`) — a pure
 * lifecycle read with zero time involvement. Visibility is the caller's readable projects (FR-013);
 * the totals reconcile with `GET /time/summary?groupBy=period&userId=…` for the same week (SC-002).
 */
@Injectable()
export class WeeklySummaryProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async getWeek(query: ReportWeekQuery): Promise<WeeklySummary> {
    const valid = validateWeekStart(query.weekStart);
    if (!valid.ok) {
      throw new BadRequestException(valid.message);
    }
    const weekStart = query.weekStart;
    const weekEnd = weekEndOf(weekStart);
    const userId = query.userId ?? this.tenant.getUserId();
    if (!userId) {
      throw new BadRequestException('No subject user for the weekly summary.');
    }

    const accessibleProjectIds = await this.projects.accessibleProjectIds();
    if (accessibleProjectIds.length === 0) {
      return this.emptyWeek(weekStart, weekEnd, userId);
    }

    const scope: ReportScope = { from: weekStart, to: weekEnd, userId, accessibleProjectIds };
    const [items, totals, completedItems] = await Promise.all([
      this.timeLogs.weeklyItems(scope),
      this.timeLogs.reportTotals(scope),
      this.workItems.listCompletedForUser(userId, weekStart, weekEnd, accessibleProjectIds),
    ]);
    return { weekStart, weekEnd, userId, totals, items, completedItems };
  }

  private emptyWeek(weekStart: string, weekEnd: string, userId: string): WeeklySummary {
    return {
      weekStart,
      weekEnd,
      userId,
      totals: { loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
      items: [],
      completedItems: [],
    };
  }
}
