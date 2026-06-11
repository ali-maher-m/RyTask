import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ReportOverview, ReportRangeQuery, ReportWeekRow } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { validateRange, weekStartsInRange } from '../domain/report-range.policy';
import { type ReportScope, TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * The flagship "Where did my time go?" read-model (US1, FR-RPT-001, research D1). Composes three
 * pure tenant-scoped aggregates — whole-range split totals, per-ISO-week rows, and the top time-sink
 * items — into one screen of data. Read-only (FR-015): no writes, no activity, no notifications.
 *
 * Visibility (FR-013/SC-007): a supplied `projectId` asserts the caller's VIEWER role; otherwise the
 * query is restricted to `accessibleProjectIds()` (a caller who can read no project gets an honest
 * empty report). The inclusive range + 366-day span are validated by `report-range.policy` (→ 400).
 * Zero-logged weeks are filled so the "By week" table reads continuously (data-model §2.1).
 */
@Injectable()
export class ReportOverviewProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
  ) {}

  async getOverview(query: ReportRangeQuery): Promise<ReportOverview> {
    const range = validateRange(query.from, query.to);
    if (!range.ok) {
      throw new BadRequestException(range.message);
    }

    const scope = await this.resolveScope(query);
    if (!scope) {
      return this.emptyOverview(query); // no readable projects → zeroed totals, zero week rows
    }

    const [totals, weekRows, topItems] = await Promise.all([
      this.timeLogs.reportTotals(scope),
      this.timeLogs.reportWeeks(scope),
      this.timeLogs.reportTopItems(scope, 10),
    ]);
    return {
      range: { from: query.from, to: query.to },
      totals,
      weeks: this.fillWeeks(query.from, query.to, weekRows),
      topItems,
    };
  }

  /** Resolve the readable-project scope, or `null` when the caller can read no project (FR-013). */
  private async resolveScope(query: ReportRangeQuery): Promise<ReportScope | null> {
    if (query.projectId) {
      await this.projects.assertRole(query.projectId, 'VIEWER');
      return { from: query.from, to: query.to, projectId: query.projectId, userId: query.userId };
    }
    const accessibleProjectIds = await this.projects.accessibleProjectIds();
    if (accessibleProjectIds.length === 0) {
      return null;
    }
    return { from: query.from, to: query.to, userId: query.userId, accessibleProjectIds };
  }

  /** Project the per-week rows onto the full ISO-week list for the range, filling empty weeks with zeros. */
  private fillWeeks(from: string, to: string, rows: ReportWeekRow[]): ReportWeekRow[] {
    const byWeek = new Map(rows.map((r) => [r.weekStart, r]));
    return weekStartsInRange(from, to).map(
      (weekStart) =>
        byWeek.get(weekStart) ?? {
          weekStart,
          loggedSeconds: 0,
          plannedSeconds: 0,
          interruptionSeconds: 0,
        },
    );
  }

  private emptyOverview(query: ReportRangeQuery): ReportOverview {
    return {
      range: { from: query.from, to: query.to },
      totals: { loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
      weeks: this.fillWeeks(query.from, query.to, []),
      topItems: [],
    };
  }
}
