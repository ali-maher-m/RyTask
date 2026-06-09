import { Inject, Injectable } from '@nestjs/common';
import type { ItemRollup, TimeSummaryQuery, TimeSummaryRow } from '@rytask/contracts';
import {
  type Database,
  type TimeEntryClass,
  type TimeEntrySource,
  timeLogs,
  workItems,
} from '@rytask/db';
import { type SQL, and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
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
  async summarize(params: TimeSummaryQuery): Promise<TimeSummaryRow[]> {
    const keyExpr = this.summaryKeyExpr(params);
    const filters: (SQL | undefined)[] = [isNull(timeLogs.deletedAt), isNull(workItems.deletedAt)];
    if (params.projectId) filters.push(eq(timeLogs.projectId, params.projectId));
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
}
