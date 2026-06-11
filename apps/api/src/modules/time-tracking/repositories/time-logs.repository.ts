import { Inject, Injectable } from '@nestjs/common';
import type {
  CaptureSource,
  ItemRollup,
  LedgerItem,
  LedgerWeekRow,
  ReportTopItem,
  ReportTotals,
  ReportWeekRow,
  TimeSummaryQuery,
  TimeSummaryRow,
  WeeklyItemRow,
} from '@rytask/contracts';
import {
  type Database,
  type TimeEntryClass,
  type TimeEntrySource,
  projects,
  timeLogs,
  users,
  workItems,
} from '@rytask/db';
import { type SQL, and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type TimeLogRow = typeof timeLogs.$inferSelect;

export interface CreateTimeLogData {
  workspaceId: string;
  projectId: string;
  workItemId: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  note?: string | null;
  billable?: boolean;
  source: TimeEntrySource;
  classification: TimeEntryClass;
  classificationOverridden?: boolean;
}

export interface UpdateTimeLogData {
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  note?: string | null;
  billable?: boolean;
  classification?: TimeEntryClass;
  classificationOverridden?: boolean;
}

/**
 * The filter scope shared by every M4 report read-model (data-model §3, research D3/D5). `from`/`to`
 * are inclusive `YYYY-MM-DD` calendar days bounded in UTC. When `projectId` is supplied the query is
 * pinned to it (the provider has already asserted VIEWER); otherwise it is restricted to
 * `accessibleProjectIds` (a NON-EMPTY list — the provider short-circuits the empty case, so the
 * `inArray` never renders an empty `IN ()`). `userId` is an optional per-user filter.
 */
export interface ReportScope {
  from: string;
  to: string;
  projectId?: string;
  userId?: string;
  accessibleProjectIds?: string[];
}

/**
 * Tenant-scoped reads/writes for `time_logs` (owned by the time-tracking module, data-model §2.2) —
 * the atomic unit all aggregation sums. Soft-delete via `deleted_at`: every read filters
 * `deleted_at IS NULL` (deleted entries drop out of lists, the meter, and totals, but remain
 * recoverable — research D15). All access is `organization_id`-scoped via {@link TenantScopedRepository}.
 * Aggregation read-models (rollup/summary) are added per story (US2/US7) over these same scoped rows.
 */
@Injectable()
export class TimeLogsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a finalized entry (tenant-scoped). `source` is set server-side by the calling path. */
  async create(data: CreateTimeLogData): Promise<TimeLogRow> {
    const [row] = await this.db
      .insert(timeLogs)
      .values({
        organizationId: this.tenant.getOrgId(),
        workspaceId: data.workspaceId,
        projectId: data.projectId,
        workItemId: data.workItemId,
        userId: data.userId,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        durationSeconds: data.durationSeconds,
        note: data.note ?? null,
        billable: data.billable ?? false,
        source: data.source,
        classification: data.classification,
        classificationOverridden: data.classificationOverridden ?? false,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert time log');
    }
    return row;
  }

  /** A single non-deleted entry by id (tenant-scoped), or null. */
  async findById(id: string): Promise<TimeLogRow | null> {
    const [row] = await this.db
      .select()
      .from(timeLogs)
      .where(this.scoped(timeLogs, eq(timeLogs.id, id), isNull(timeLogs.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Non-deleted entries for a work item (tenant-scoped), newest first. */
  async listForItem(workItemId: string): Promise<TimeLogRow[]> {
    return this.db
      .select()
      .from(timeLogs)
      .where(this.scoped(timeLogs, eq(timeLogs.workItemId, workItemId), isNull(timeLogs.deletedAt)))
      .orderBy(desc(timeLogs.startedAt), desc(timeLogs.id));
  }

  /**
   * One keyset page of a work item's non-deleted entries (tenant-scoped), newest first by
   * `(started_at, id)` (US3/US4). Fetches `limit + 1` so the provider can cheaply compute
   * `hasNextPage`. The cursor is the last row's `(startedAt, id)`; the DESC keyset predicate is
   * `started_at < cur.startedAt OR (started_at = cur.startedAt AND id < cur.id)`.
   */
  async listPageForItem(
    workItemId: string,
    limit: number,
    cursor: { startedAt: Date; id: string } | null,
  ): Promise<TimeLogRow[]> {
    const keyset = cursor
      ? or(
          lt(timeLogs.startedAt, cursor.startedAt),
          and(eq(timeLogs.startedAt, cursor.startedAt), lt(timeLogs.id, cursor.id)),
        )
      : undefined;
    return this.db
      .select()
      .from(timeLogs)
      .where(
        this.scoped(
          timeLogs,
          eq(timeLogs.workItemId, workItemId),
          isNull(timeLogs.deletedAt),
          keyset,
        ),
      )
      .orderBy(desc(timeLogs.startedAt), desc(timeLogs.id))
      .limit(limit + 1);
  }

  /** Partial update of a non-deleted entry (tenant-scoped). Returns the updated row, or null. */
  async update(id: string, data: UpdateTimeLogData): Promise<TimeLogRow | null> {
    const [row] = await this.db
      .update(timeLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(this.scoped(timeLogs, eq(timeLogs.id, id), isNull(timeLogs.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Soft-delete a non-deleted entry (tenant-scoped). Returns the deleted row, or null. */
  async softDelete(id: string, deletedAt: Date): Promise<TimeLogRow | null> {
    const [row] = await this.db
      .update(timeLogs)
      .set({ deletedAt, updatedAt: deletedAt })
      .where(this.scoped(timeLogs, eq(timeLogs.id, id), isNull(timeLogs.deletedAt)))
      .returning();
    return row ?? null;
  }

  /**
   * Per-item logged totals for a project — the row-meter read-model (US2, data-model §4.1, research
   * D10/D11). `SUM(duration_seconds) … GROUP BY work_item_id`, tenant-scoped, excluding soft-deleted
   * logs AND logs of soft-deleted items (the inner join on a non-deleted `work_items` row). The web
   * merges this with the items list client-side, so work-items never reads `time_logs`. Joining the
   * `work_items` table here is allowed (shared schema, this repo extends TenantScopedRepository — same
   * pattern as the search repo); the boundary rule only forbids importing another module's *code*.
   */
  async rollupByItem(projectId: string): Promise<ItemRollup[]> {
    const rows = await this.db
      .select({
        workItemId: timeLogs.workItemId,
        loggedSeconds: sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`,
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .where(
        this.scoped(
          timeLogs,
          eq(timeLogs.projectId, projectId),
          isNull(timeLogs.deletedAt),
          isNull(workItems.deletedAt),
        ),
      )
      .groupBy(timeLogs.workItemId);
    // pg returns SUM as a string; coerce to a JS number (durations are small integer seconds).
    return rows.map((r) => ({ workItemId: r.workItemId, loggedSeconds: Number(r.loggedSeconds) }));
  }

  /**
   * The grouped-totals read-model (US7, data-model §4.2, research D10). A tenant-scoped
   * `SUM(duration_seconds)` grouped by the requested axis (item / user / project / day|week period),
   * each split planned vs interruption so `plannedSeconds + interruptionSeconds === loggedSeconds`
   * exactly (SC-005). Soft-delete-aware: excludes deleted logs AND logs of soft-deleted items (the
   * inner join on a non-deleted `work_items` row — research D15). Every total is a pure SUM, so it
   * reconciles to its contributing entries and recomputes consistently after any edit. Joining the
   * shared `work_items` table is allowed (this repo extends TenantScopedRepository); the boundary rule
   * only forbids importing another module's *code*.
   */
  async summarize(
    params: TimeSummaryQuery,
    accessibleProjectIds?: string[],
  ): Promise<TimeSummaryRow[]> {
    const keyExpr = this.summaryKeyExpr(params);
    const filters: (SQL | undefined)[] = [isNull(timeLogs.deletedAt), isNull(workItems.deletedAt)];
    if (params.projectId) filters.push(eq(timeLogs.projectId, params.projectId));
    // D3 hardening (FR-013): the org-wide (no-`projectId`) path is restricted to the caller's readable
    // projects. The provider supplies a NON-EMPTY list (it short-circuits the empty case), so the
    // `inArray` never renders an empty `IN ()`.
    if (!params.projectId && accessibleProjectIds) {
      filters.push(inArray(timeLogs.projectId, accessibleProjectIds));
    }
    if (params.userId) filters.push(eq(timeLogs.userId, params.userId));
    // `from`/`to` are calendar days (server-side, inclusive of the whole `to` day).
    if (params.from)
      filters.push(gte(timeLogs.startedAt, new Date(`${params.from}T00:00:00.000Z`)));
    if (params.to) {
      const end = new Date(`${params.to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1); // exclusive upper bound = the day after `to`
      filters.push(lt(timeLogs.startedAt, end));
    }
    const sumWhen = (cls: TimeEntryClass) =>
      sql<number>`COALESCE(SUM(CASE WHEN ${timeLogs.classification} = ${cls} THEN ${timeLogs.durationSeconds} ELSE 0 END), 0)`;

    const rows = await this.db
      .select({
        key: keyExpr,
        loggedSeconds: sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`,
        plannedSeconds: sumWhen('PLANNED'),
        interruptionSeconds: sumWhen('INTERRUPTION'),
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .where(this.scoped(timeLogs, ...filters))
      .groupBy(keyExpr)
      .orderBy(keyExpr);

    return rows.map((r) => ({
      key: String(r.key),
      loggedSeconds: Number(r.loggedSeconds),
      plannedSeconds: Number(r.plannedSeconds),
      interruptionSeconds: Number(r.interruptionSeconds),
    }));
  }

  /** The group-key SQL for a summary axis — an id column, or a day/week period bucket as `YYYY-MM-DD`. */
  private summaryKeyExpr(params: TimeSummaryQuery): SQL<string> {
    switch (params.groupBy) {
      case 'item':
        return sql<string>`${timeLogs.workItemId}`;
      case 'project':
        return sql<string>`${timeLogs.projectId}`;
      case 'user':
        // A removed user's logs survive with a null owner (attribution lost) — bucket them together.
        return sql<string>`COALESCE(${timeLogs.userId}::text, 'unknown')`;
      case 'period': {
        // Inline the unit as a RAW literal (not a bound param) so the expression renders identically
        // in SELECT and GROUP BY — a bound `$n` differs between the two clauses and Postgres then
        // rejects it ("must appear in GROUP BY"). `unit` is a fixed internal word, never user input.
        const unit = params.period === 'week' ? 'week' : 'day';
        return sql<string>`to_char(date_trunc('${sql.raw(unit)}', ${timeLogs.startedAt}), 'YYYY-MM-DD')`;
      }
    }
  }

  // ──────────────────────────────────────────────────────── M4 report read-models (research D2)
  //
  // Pure tenant-scoped aggregates over `time_logs ⋈ work_items (⋈ projects | ⟕ users)` — the shipped
  // `summarize`/`rollupByItem` idiom: shared-schema joins allowed, module-code imports forbidden. Every
  // figure excludes soft-deleted logs AND logs of soft-deleted items (the inner join on a non-deleted
  // `work_items` row — research D10), so reports reconcile EXACTLY with every other M2 surface (SC-002).

  /** The common WHERE for a report scope: non-deleted logs/items, range, project + user filter. */
  private reportFilters(scope: ReportScope): SQL[] {
    const filters: SQL[] = [isNull(timeLogs.deletedAt), isNull(workItems.deletedAt)];
    if (scope.projectId) {
      filters.push(eq(timeLogs.projectId, scope.projectId));
    } else if (scope.accessibleProjectIds) {
      filters.push(inArray(timeLogs.projectId, scope.accessibleProjectIds));
    }
    if (scope.userId) filters.push(eq(timeLogs.userId, scope.userId));
    // Calendar-day bounds in UTC, inclusive of the whole `to` day (exclusive upper = day after `to`).
    filters.push(gte(timeLogs.startedAt, new Date(`${scope.from}T00:00:00.000Z`)));
    const end = new Date(`${scope.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    filters.push(lt(timeLogs.startedAt, end));
    return filters;
  }

  /** `SUM(duration_seconds)` for the class, `0` when none — the conditional split (SC-002). */
  private static sumWhen(cls: TimeEntryClass): SQL<number> {
    return sql<number>`COALESCE(SUM(CASE WHEN ${timeLogs.classification} = ${cls} THEN ${timeLogs.durationSeconds} ELSE 0 END), 0)`;
  }

  /** Whole-range split totals (data-model §2.1). One row; `planned + interruption === logged`. */
  async reportTotals(scope: ReportScope): Promise<ReportTotals> {
    const [row] = await this.db
      .select({
        loggedSeconds: sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`,
        plannedSeconds: TimeLogsRepository.sumWhen('PLANNED'),
        interruptionSeconds: TimeLogsRepository.sumWhen('INTERRUPTION'),
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .where(this.scoped(timeLogs, ...this.reportFilters(scope)));
    return {
      loggedSeconds: Number(row?.loggedSeconds ?? 0),
      plannedSeconds: Number(row?.plannedSeconds ?? 0),
      interruptionSeconds: Number(row?.interruptionSeconds ?? 0),
    };
  }

  /** Per-ISO-week split totals (Monday-keyed, UTC), ascending — only weeks WITH data (provider fills zeros). */
  async reportWeeks(scope: ReportScope): Promise<ReportWeekRow[]> {
    const weekExpr = sql<string>`to_char(date_trunc('week', ${timeLogs.startedAt}), 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        weekStart: weekExpr,
        loggedSeconds: sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`,
        plannedSeconds: TimeLogsRepository.sumWhen('PLANNED'),
        interruptionSeconds: TimeLogsRepository.sumWhen('INTERRUPTION'),
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .where(this.scoped(timeLogs, ...this.reportFilters(scope)))
      .groupBy(weekExpr)
      .orderBy(asc(weekExpr));
    return rows.map((r) => ({
      weekStart: String(r.weekStart),
      loggedSeconds: Number(r.loggedSeconds),
      plannedSeconds: Number(r.plannedSeconds),
      interruptionSeconds: Number(r.interruptionSeconds),
    }));
  }

  /** The top `limit` time-sink items by logged seconds, descending (key tiebreak), with their human key. */
  async reportTopItems(scope: ReportScope, limit: number): Promise<ReportTopItem[]> {
    const keyExpr = sql<string>`${projects.keyPrefix} || '-' || ${workItems.number}`;
    const loggedExpr = sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`;
    const rows = await this.db
      .select({
        workItemId: timeLogs.workItemId,
        projectId: timeLogs.projectId,
        key: keyExpr,
        title: workItems.title,
        loggedSeconds: loggedExpr,
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .where(this.scoped(timeLogs, ...this.reportFilters(scope)))
      .groupBy(
        timeLogs.workItemId,
        timeLogs.projectId,
        projects.keyPrefix,
        workItems.number,
        workItems.title,
      )
      .orderBy(desc(loggedExpr), asc(keyExpr))
      .limit(limit);
    return rows.map((r) => ({
      workItemId: r.workItemId,
      projectId: r.projectId,
      key: String(r.key),
      title: r.title,
      loggedSeconds: Number(r.loggedSeconds),
    }));
  }

  /** Interruption-only filters: the report scope plus `classification = 'INTERRUPTION'` (US2, data-model §2.2). */
  private interruptionFilters(scope: ReportScope): SQL[] {
    return [...this.reportFilters(scope), eq(timeLogs.classification, 'INTERRUPTION')];
  }

  /**
   * One row per interruption item (data-model §2.2): seconds + entry count, joined to its key/title,
   * M3 capture `source`, and reporter name. The reporter join is a LEFT join on `reporter_id` so a
   * removed reporter (null `reporter_id`) yields `reporter: null` ("(removed user)"). Ordered seconds
   * DESC, then key ASC for determinism.
   */
  async ledgerItems(scope: ReportScope): Promise<LedgerItem[]> {
    const keyExpr = sql<string>`${projects.keyPrefix} || '-' || ${workItems.number}`;
    const secondsExpr = sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`;
    const rows = await this.db
      .select({
        workItemId: timeLogs.workItemId,
        projectId: timeLogs.projectId,
        key: keyExpr,
        title: workItems.title,
        captureSource: workItems.source,
        reporterId: workItems.reporterId,
        reporterName: users.name,
        entryCount: sql<number>`COUNT(*)`,
        seconds: secondsExpr,
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .leftJoin(users, eq(users.id, workItems.reporterId))
      .where(this.scoped(timeLogs, ...this.interruptionFilters(scope)))
      .groupBy(
        timeLogs.workItemId,
        timeLogs.projectId,
        projects.keyPrefix,
        workItems.number,
        workItems.title,
        workItems.source,
        workItems.reporterId,
        users.name,
      )
      .orderBy(desc(secondsExpr), asc(keyExpr));
    return rows.map((r) => ({
      workItemId: r.workItemId,
      projectId: r.projectId,
      key: String(r.key),
      title: r.title,
      captureSource: r.captureSource as CaptureSource,
      reporter: r.reporterId ? { id: r.reporterId, name: r.reporterName ?? '' } : null,
      entryCount: Number(r.entryCount),
      seconds: Number(r.seconds),
    }));
  }

  /** Per-ISO-week interruption evidence (Monday-keyed, ascending): seconds + distinct item count. */
  async ledgerWeeks(scope: ReportScope): Promise<LedgerWeekRow[]> {
    const weekExpr = sql<string>`to_char(date_trunc('week', ${timeLogs.startedAt}), 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        weekStart: weekExpr,
        seconds: sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`,
        itemCount: sql<number>`COUNT(DISTINCT ${timeLogs.workItemId})`,
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .where(this.scoped(timeLogs, ...this.interruptionFilters(scope)))
      .groupBy(weekExpr)
      .orderBy(asc(weekExpr));
    return rows.map((r) => ({
      weekStart: String(r.weekStart),
      seconds: Number(r.seconds),
      itemCount: Number(r.itemCount),
    }));
  }

  /**
   * Per-item logged totals for one user across one week (US3, data-model §2.3): each item the subject
   * tracked time on, with its raw `estimate_value` (M1 numeric-as-string) and a `completed` flag
   * (`completed_at` inside the same week). `scope.userId` is the subject; the range is the Mon–Sun
   * week. Ordered seconds DESC, key ASC. Soft-delete-aware via the inner join (research D10).
   */
  async weeklyItems(scope: ReportScope): Promise<WeeklyItemRow[]> {
    const keyExpr = sql<string>`${projects.keyPrefix} || '-' || ${workItems.number}`;
    const loggedExpr = sql<number>`COALESCE(SUM(${timeLogs.durationSeconds}), 0)`;
    const weekStart = new Date(`${scope.from}T00:00:00.000Z`);
    const weekEndExclusive = new Date(`${scope.to}T00:00:00.000Z`);
    weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 1);
    const completedExpr = sql<boolean>`(${workItems.completedAt} >= ${weekStart} AND ${workItems.completedAt} < ${weekEndExclusive})`;
    const rows = await this.db
      .select({
        workItemId: timeLogs.workItemId,
        projectId: timeLogs.projectId,
        key: keyExpr,
        title: workItems.title,
        estimateValue: workItems.estimateValue,
        completed: completedExpr,
        loggedSeconds: loggedExpr,
      })
      .from(timeLogs)
      .innerJoin(workItems, eq(workItems.id, timeLogs.workItemId))
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .where(this.scoped(timeLogs, ...this.reportFilters(scope)))
      .groupBy(
        timeLogs.workItemId,
        timeLogs.projectId,
        projects.keyPrefix,
        workItems.number,
        workItems.title,
        workItems.estimateValue,
        workItems.completedAt,
      )
      .orderBy(desc(loggedExpr), asc(keyExpr));
    return rows.map((r) => ({
      workItemId: r.workItemId,
      projectId: r.projectId,
      key: String(r.key),
      title: r.title,
      loggedSeconds: Number(r.loggedSeconds),
      estimateValue: r.estimateValue ?? null,
      completed: Boolean(r.completed),
    }));
  }
}
