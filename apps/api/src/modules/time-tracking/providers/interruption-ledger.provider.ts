import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { InterruptionLedger, ReportRangeQuery } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { validateRange } from '../domain/report-range.policy';
import { type ReportScope, TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * The interruption ledger — the evidence behind the headline number (US2, FR-RPT-002, research D1).
 * One row per interruption-classified item (key/title, M3 capture source, who raised it, entry count,
 * seconds) plus a per-week breakdown. The ledger total === the overview's interruption figure for the
 * same range/scope (SC-003): both are pure interruption-only `SUM(duration_seconds)` over the same
 * tenant-scoped, soft-delete-aware rows. Read-only (FR-015). Visibility matches US1: a supplied
 * `projectId` asserts VIEWER, otherwise the query is restricted to `accessibleProjectIds()`.
 */
@Injectable()
export class InterruptionLedgerProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
  ) {}

  async getLedger(query: ReportRangeQuery): Promise<InterruptionLedger> {
    const range = validateRange(query.from, query.to);
    if (!range.ok) {
      throw new BadRequestException(range.message);
    }

    const scope = await this.resolveScope(query);
    if (!scope) {
      return this.emptyLedger(query);
    }

    const [items, weeks] = await Promise.all([
      this.timeLogs.ledgerItems(scope),
      this.timeLogs.ledgerWeeks(scope),
    ]);
    return {
      range: { from: query.from, to: query.to },
      totalSeconds: items.reduce((sum, i) => sum + i.seconds, 0),
      itemCount: items.length,
      entryCount: items.reduce((sum, i) => sum + i.entryCount, 0),
      items,
      weeks,
    };
  }

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

  private emptyLedger(query: ReportRangeQuery): InterruptionLedger {
    return {
      range: { from: query.from, to: query.to },
      totalSeconds: 0,
      itemCount: 0,
      entryCount: 0,
      items: [],
      weeks: [],
    };
  }
}
