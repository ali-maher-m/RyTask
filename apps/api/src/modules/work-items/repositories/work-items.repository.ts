import { Inject, Injectable } from '@nestjs/common';
import {
  type Database,
  activity,
  projectCounters,
  projectMembers,
  projects,
  statuses,
  users,
  workItemLabels,
  workItemWatchers,
  workItems,
} from '@rytask/db';
import { type SQL, and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { QueryColumns } from '../../views/views.contract';

export type WorkItemRow = typeof workItems.$inferSelect;

export interface CreateWorkItemData {
  projectId: string;
  title: string;
  description?: string | null;
  statusId: string;
  priority: WorkItemRow['priority'];
  assigneeId?: string | null;
  reporterId?: string | null;
  parentId?: string | null;
  estimateValue?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
  labelIds?: string[];
  /** Watchers to seed (assignee/author/mentions). Deduped by userId. */
  watchers?: Array<{ userId: string; reason: WatcherReason }>;
}

type WatcherReason = 'ASSIGNEE' | 'AUTHOR' | 'MENTIONED' | 'MANUAL';

export interface CreatedWorkItem {
  item: WorkItemRow;
  keyPrefix: string;
}

/** A single per-field activity entry to append in the same tx as an update. */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  /** Activity action for this row; defaults to UPDATED. status → STATUS_CHANGED, etc. */
  action?: typeof activity.$inferInsert.action;
}

/** Column values to write in an update (already validated/coerced by the provider). */
export interface UpdateWorkItemColumns {
  title?: string;
  description?: string | null;
  priority?: WorkItemRow['priority'];
  assigneeId?: string | null;
  parentId?: string | null;
  statusId?: string;
  estimateValue?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  dueDate?: string | null;
  /** Set/clear when a status transition crosses the COMPLETED category boundary. */
  completedAt?: Date | null;
}

/** Default gap between board positions; a fresh card appends at `max + STEP` (research D13). */
const POSITION_STEP = 1024;

/** Thrown when the client's expected `version` no longer matches the row (FR-WI-009). */
export class VersionConflictError extends Error {
  constructor(public readonly expected: number) {
    super('work item version conflict');
    this.name = 'VersionConflictError';
  }
}

/**
 * Tenant-scoped reads/writes for `work_items` (+ the owning module's labels/watchers/
 * activity links and the project key counter). The full create is ONE transaction so a
 * rolled-back create never burns a key and a `CREATED` activity row always matches the
 * insert (research D1/D11).
 */
@Injectable()
export class WorkItemsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Atomic create: mint a never-recycled number → insert → labels → watchers → CREATED activity. */
  async createWorkItem(data: CreateWorkItemData): Promise<CreatedWorkItem> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx): Promise<CreatedWorkItem> => {
      // Project gives us the workspace + key prefix (tenant-scoped read).
      const [project] = await tx
        .select({ workspaceId: projects.workspaceId, keyPrefix: projects.keyPrefix })
        .from(projects)
        .where(and(eq(projects.id, data.projectId), eq(projects.organizationId, orgId)))
        .limit(1);
      if (!project) {
        throw new Error(`project ${data.projectId} not found in org`);
      }

      // Atomic key mint under the counter row lock (never recycled, FR-WI-002 / D1).
      const [counter] = await tx
        .update(projectCounters)
        .set({ lastNumber: sql`${projectCounters.lastNumber} + 1` })
        .where(
          and(
            eq(projectCounters.projectId, data.projectId),
            eq(projectCounters.organizationId, orgId),
          ),
        )
        .returning({ number: projectCounters.lastNumber });
      if (!counter) {
        throw new Error(`no project_counter for project ${data.projectId}`);
      }

      // Seed a board `position` so a fresh card sorts deterministically (appended to the end of
      // its status column) instead of as NULL — board/list order by `position` (SC-005).
      const [posRow] = await tx
        .select({ maxPos: sql<string | null>`max(${workItems.position})` })
        .from(workItems)
        .where(
          and(
            eq(workItems.organizationId, orgId),
            eq(workItems.projectId, data.projectId),
            eq(workItems.statusId, data.statusId),
            isNull(workItems.deletedAt),
          ),
        );
      const nextPosition = (posRow?.maxPos != null ? Number(posRow.maxPos) : 0) + POSITION_STEP;

      const [item] = await tx
        .insert(workItems)
        .values({
          organizationId: orgId,
          workspaceId: project.workspaceId,
          projectId: data.projectId,
          number: counter.number,
          title: data.title,
          description: data.description ?? null,
          statusId: data.statusId,
          priority: data.priority,
          assigneeId: data.assigneeId ?? null,
          reporterId: data.reporterId ?? null,
          parentId: data.parentId ?? null,
          position: String(nextPosition),
          estimateValue: data.estimateValue ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          dueDate: data.dueDate ?? null,
        })
        .returning();
      if (!item) {
        throw new Error('failed to insert work item');
      }

      if (data.labelIds?.length) {
        await tx
          .insert(workItemLabels)
          .values(
            data.labelIds.map((labelId) => ({
              organizationId: orgId,
              workItemId: item.id,
              labelId,
            })),
          )
          .onConflictDoNothing();
      }

      if (data.watchers?.length) {
        const seen = new Set<string>();
        const rows: Array<{
          organizationId: string;
          workItemId: string;
          userId: string;
          reason: WatcherReason;
        }> = [];
        for (const w of data.watchers) {
          if (seen.has(w.userId)) continue;
          seen.add(w.userId);
          rows.push({
            organizationId: orgId,
            workItemId: item.id,
            userId: w.userId,
            reason: w.reason,
          });
        }
        if (rows.length > 0) {
          await tx.insert(workItemWatchers).values(rows).onConflictDoNothing();
        }
      }

      await tx.insert(activity).values({
        organizationId: orgId,
        workItemId: item.id,
        actorId: data.reporterId ?? null,
        action: 'CREATED',
        field: null,
        oldValue: null,
        newValue: { title: item.title },
      });

      return { item, keyPrefix: project.keyPrefix };
    });
  }

  /** Fetch a single non-deleted work item (tenant-scoped) plus its project key prefix. */
  async findById(id: string): Promise<CreatedWorkItem | null> {
    const orgId = this.tenant.getOrgId();
    const items = await this.db
      .select()
      .from(workItems)
      .where(this.scoped(workItems, eq(workItems.id, id), isNull(workItems.deletedAt)))
      .limit(1);
    const item = items[0];
    if (!item) return null;
    const prefixes = await this.db
      .select({ keyPrefix: projects.keyPrefix })
      .from(projects)
      .where(and(eq(projects.id, item.projectId), eq(projects.organizationId, orgId)))
      .limit(1);
    const keyPrefix = prefixes[0]?.keyPrefix;
    return keyPrefix ? { item, keyPrefix } : null;
  }

  /**
   * Load `parentId`'s ancestor chain (tenant-scoped) via a recursive CTE — root-first,
   * EXCLUDING the parent itself (research D4, FR-HIER-001). Used to validate a (re)parenting
   * against the hierarchy policy before writing: if the would-be child appears in this chain,
   * the link would create a cycle. A non-existent / cross-tenant parent yields `[]` (the
   * provider rejects an unknown parent separately). Bounded by the depth cap to stay cheap.
   */
  async ancestorIds(parentId: string): Promise<string[]> {
    const orgId = this.tenant.getOrgId();
    const rows = await this.db.execute<{ id: string; depth: number }>(sql`
      with recursive chain as (
        select ${workItems.id} as id, ${workItems.parentId} as parent_id, 1 as depth
          from ${workItems}
         where ${workItems.id} = ${parentId}
           and ${workItems.organizationId} = ${orgId}
        union all
        select w.id, w.parent_id, c.depth + 1
          from ${workItems} w
          join chain c on w.id = c.parent_id
         where w.organization_id = ${orgId}
           and c.depth < 64
      )
      select id, depth from chain where id <> ${parentId} order by depth desc
    `);
    // `depth desc` walks parent → … → root, so the result is already root-first.
    return rows.rows.map((r) => r.id);
  }

  /**
   * Height of an item's subtree — the item counts as 1, a leaf → 1 — tenant-scoped, via a
   * recursive CTE walking its (non-deleted) descendants. Used to keep `parentDepth +
   * subtreeHeight` within the nesting cap when RE-parenting an existing item that may itself
   * carry children (FR-HIER-001). Bounded by a hard depth guard so a corrupt cycle can't loop.
   */
  async subtreeHeight(itemId: string): Promise<number> {
    const orgId = this.tenant.getOrgId();
    const rows = await this.db.execute<{ height: number }>(sql`
      with recursive subtree as (
        select ${workItems.id} as id, 1 as depth
          from ${workItems}
         where ${workItems.id} = ${itemId}
           and ${workItems.organizationId} = ${orgId}
           and ${workItems.deletedAt} is null
        union all
        select w.id, s.depth + 1
          from ${workItems} w
          join subtree s on w.parent_id = s.id
         where w.organization_id = ${orgId}
           and w.deleted_at is null
           and s.depth < 64
      )
      select coalesce(max(depth), 1)::int as height from subtree
    `);
    return rows.rows[0]?.height ?? 1;
  }

  /**
   * List the direct (non-deleted) children of an item, tenant-scoped, ordered by board
   * position then number (FR-HIER-001). Used by GET /work-items/{id}/subtasks.
   */
  async listChildren(parentId: string): Promise<WorkItemRow[]> {
    return this.db
      .select()
      .from(workItems)
      .where(this.scoped(workItems, eq(workItems.parentId, parentId), isNull(workItems.deletedAt)))
      .orderBy(asc(workItems.position), asc(workItems.number));
  }

  /** Live child count for an item (tenant-scoped) — non-deleted children only (FR-HIER-001). */
  async childCount(parentId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workItems)
      .where(this.scoped(workItems, eq(workItems.parentId, parentId), isNull(workItems.deletedAt)));
    return row?.count ?? 0;
  }

  /** Live child counts for many items in one query (tenant-scoped) — for list/board reads. */
  async childCountsFor(parentIds: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(parentIds)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ parentId: workItems.parentId, count: sql<number>`count(*)::int` })
      .from(workItems)
      .where(
        this.scoped(workItems, inArray(workItems.parentId, unique), isNull(workItems.deletedAt)),
      )
      .groupBy(workItems.parentId);
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.parentId) out.set(r.parentId, r.count);
    }
    return out;
  }

  /**
   * The Drizzle column/expression bindings the shared query engine needs (filter-dsl.md).
   * The repository owns `@rytask/db`, so it supplies these; the compiler stays
   * infrastructure-free. `statusCategory` is the joined `statuses.category`; `label`/`text`
   * are correlated EXISTS subqueries (bound parameters → injection-safe).
   */
  private queryColumns(): QueryColumns {
    return {
      id: workItems.id,
      number: workItems.number,
      title: workItems.title,
      projectId: workItems.projectId,
      statusId: workItems.statusId,
      statusCategory: statuses.category,
      priority: workItems.priority,
      assigneeId: workItems.assigneeId,
      parentId: workItems.parentId,
      dueDate: workItems.dueDate,
      startDate: workItems.startDate,
      endDate: workItems.endDate,
      createdAt: workItems.createdAt,
      updatedAt: workItems.updatedAt,
      label: (operator, value) => {
        if (operator === 'isEmpty') {
          const exists = sql`exists (select 1 from ${workItemLabels} wl where wl.work_item_id = ${workItems.id})`;
          return value === false ? exists : (sql`not ${exists}` as SQL);
        }
        const ids = (value as string[]) ?? [];
        if (ids.length === 0) {
          // Vacuously: `in []` matches nothing; `nin []` matches everything.
          return operator === 'nin' ? (sql`true` as SQL) : (sql`false` as SQL);
        }
        const inList = sql`exists (select 1 from ${workItemLabels} wl where wl.work_item_id = ${workItems.id} and wl.label_id in ${ids})`;
        return operator === 'nin' ? (sql`not ${inList}` as SQL) : (inList as SQL);
      },
      // `search_vector` is a generated tsvector column added in the SQL migration (not in
      // the Drizzle table object), so it is referenced by qualified name here (D8).
      text: (value) =>
        sql`work_items.search_vector @@ websearch_to_tsquery('english', ${String(value)})` as SQL,
    };
  }

  /**
   * List/board read path (US3, FR-VIEW-001/002/007/010). The repository joins `statuses`
   * (for category/overdue), exposes the column bindings, and lets the caller (the list
   * provider) compile the filter AST / sort / keyset via the shared query engine. Returns
   * one extra row to compute `hasNextPage` cheaply. Soft-deleted rows are excluded by
   * default. `extraWhere` carries the mandatory project / accessible-projects scope.
   */
  async listForView(opts: {
    build: (columns: QueryColumns) => { where?: SQL; orderBy: SQL[] };
    /** Restrict to a single project, or to a set of accessible projects (permission scope). */
    projectId?: string;
    accessibleProjectIds?: string[];
    limit: number;
  }): Promise<WorkItemRow[]> {
    const columns = this.queryColumns();
    const { where, orderBy } = opts.build(columns);
    let scope: SQL | undefined;
    if (opts.projectId) {
      scope = eq(workItems.projectId, opts.projectId);
    } else if (opts.accessibleProjectIds) {
      scope =
        opts.accessibleProjectIds.length > 0
          ? inArray(workItems.projectId, opts.accessibleProjectIds)
          : (sql`false` as SQL);
    }
    const predicates = this.scoped(workItems, isNull(workItems.deletedAt), scope, where);
    const rows = await this.db
      .select({ wi: workItems })
      .from(workItems)
      .innerJoin(statuses, eq(statuses.id, workItems.statusId))
      .where(predicates)
      .orderBy(...orderBy)
      .limit(opts.limit + 1);
    return rows.map((r) => r.wi);
  }

  /**
   * The project's default status id for a new item: first UNSTARTED by position, else
   * the lowest-position status (FR-WI-001 default = "To Do"). US3 formalizes the
   * statuses repository; this read keeps US1 self-contained.
   */
  async findDefaultStatusId(projectId: string): Promise<string | null> {
    const orgId = this.tenant.getOrgId();
    const rows = await this.db
      .select({ id: statuses.id, category: statuses.category, position: statuses.position })
      .from(statuses)
      .where(and(eq(statuses.organizationId, orgId), eq(statuses.projectId, projectId)))
      .orderBy(asc(statuses.position));
    const unstarted = rows.find((r) => r.category === 'UNSTARTED');
    return unstarted?.id ?? rows[0]?.id ?? null;
  }

  /**
   * Resolve a quick-add `@handle` to a project member's user id (by name or email
   * local-part, case-insensitive). Returns null if not a member → caller flags it
   * unresolved (never dropped, SC-002).
   */
  async resolveAssignee(handle: string, projectId: string): Promise<string | null> {
    const orgId = this.tenant.getOrgId();
    const [row] = await this.db
      .select({ userId: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(
          eq(projectMembers.organizationId, orgId),
          eq(projectMembers.projectId, projectId),
          sql`(lower(${users.name}) = lower(${handle}) or lower(split_part(${users.email}, '@', 1)) = lower(${handle}))`,
        ),
      )
      .limit(1);
    return row?.userId ?? null;
  }

  /** Map projectId → keyPrefix for a set of projects (tenant-scoped) — for list DTO keys. */
  async keyPrefixesFor(projectIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(projectIds)];
    if (unique.length === 0) return new Map();
    const orgId = this.tenant.getOrgId();
    const rows = await this.db
      .select({ id: projects.id, keyPrefix: projects.keyPrefix })
      .from(projects)
      .where(and(eq(projects.organizationId, orgId), inArray(projects.id, unique)));
    return new Map(rows.map((r) => [r.id, r.keyPrefix]));
  }

  /** Label ids currently attached to an item (tenant-scoped). */
  async labelIdsFor(workItemId: string): Promise<string[]> {
    const rows = await this.db
      .select({ labelId: workItemLabels.labelId })
      .from(workItemLabels)
      .where(this.scoped(workItemLabels, eq(workItemLabels.workItemId, workItemId)));
    return rows.map((r) => r.labelId);
  }

  /**
   * Fetch a single work item INCLUDING soft-deleted rows (tenant-scoped) plus its key
   * prefix. Used by restore (the row is deleted but recoverable) and the update path,
   * which needs the current `version`/field values for the diff and version check.
   */
  async findByIdIncludingDeleted(id: string): Promise<CreatedWorkItem | null> {
    const orgId = this.tenant.getOrgId();
    const items = await this.db
      .select()
      .from(workItems)
      .where(this.scoped(workItems, eq(workItems.id, id)))
      .limit(1);
    const item = items[0];
    if (!item) return null;
    const prefixes = await this.db
      .select({ keyPrefix: projects.keyPrefix })
      .from(projects)
      .where(and(eq(projects.id, item.projectId), eq(projects.organizationId, orgId)))
      .limit(1);
    const keyPrefix = prefixes[0]?.keyPrefix;
    return keyPrefix ? { item, keyPrefix } : null;
  }

  /**
   * The `position` of a sibling work item (tenant-scoped), or null if the sibling is
   * missing/deleted. Used by the board move to compute a fractional rank between
   * neighbours (research D13).
   */
  async positionOf(id: string): Promise<number | null> {
    const [row] = await this.db
      .select({ position: workItems.position })
      .from(workItems)
      .where(this.scoped(workItems, eq(workItems.id, id), isNull(workItems.deletedAt)))
      .limit(1);
    if (!row || row.position == null) return null;
    return Number(row.position);
  }

  /**
   * Apply a board move in ONE transaction (FR-VIEW-001, D11/D13): version check →
   * set `position` (and optionally `statusId` + `completed_at`) + bump `version` →
   * append the supplied activity rows (STATUS_CHANGED and/or MOVED). A stale `version`
   * throws `VersionConflictError` (→ 409) and rolls back. Returns the moved row.
   */
  async moveItem(
    id: string,
    expectedVersion: number,
    columns: { statusId?: string; position?: string; completedAt?: Date | null },
    changes: FieldChange[],
    actorId: string | null,
  ): Promise<CreatedWorkItem> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx): Promise<CreatedWorkItem> => {
      const [current] = await tx
        .select()
        .from(workItems)
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .limit(1);
      if (!current || current.deletedAt) {
        throw new Error(`work item ${id} not found in org`);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflictError(current.version);
      }

      const [item] = await tx
        .update(workItems)
        .set({
          ...columns,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .returning();
      if (!item) {
        throw new Error('failed to move work item');
      }

      if (changes.length > 0) {
        await tx.insert(activity).values(
          changes.map((c) => ({
            organizationId: orgId,
            workItemId: id,
            actorId,
            action: c.action ?? 'MOVED',
            field: c.field,
            oldValue: c.oldValue ?? null,
            newValue: c.newValue ?? null,
          })),
        );
      }

      const [project] = await tx
        .select({ keyPrefix: projects.keyPrefix })
        .from(projects)
        .where(and(eq(projects.id, item.projectId), eq(projects.organizationId, orgId)))
        .limit(1);
      return { item, keyPrefix: project?.keyPrefix ?? '' };
    });
  }

  /** The category of a status row in this org (for the completed_at rule). */
  async statusCategory(statusId: string): Promise<string | null> {
    const info = await this.statusInfo(statusId);
    return info?.category ?? null;
  }

  /**
   * A status row's owning project + category in this org (or `null`). Used to assert a status
   * actually belongs to the work item's project before assigning it — `statusCategory` alone is
   * org-scoped, which would let a board be corrupted with another project's column.
   */
  async statusInfo(statusId: string): Promise<{ projectId: string; category: string } | null> {
    const orgId = this.tenant.getOrgId();
    const [row] = await this.db
      .select({ projectId: statuses.projectId, category: statuses.category })
      .from(statuses)
      .where(and(eq(statuses.id, statusId), eq(statuses.organizationId, orgId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * SYSTEM scan — deliberately NOT org-scoped (the scheduled due-soon/overdue job runs outside any
   * request, like the identity global lookups). Returns every non-deleted, non-completed item with
   * a due date on or before `today + soonDays`, across all tenants, each tagged with its
   * `organizationId` so the dispatcher re-scopes per tenant at write time (FR-NOTIF-001).
   */
  async listDueAndOverdue(
    today: string,
    soonDays: number,
  ): Promise<
    Array<{
      organizationId: string;
      workItemId: string;
      assigneeId: string | null;
      dueDate: string;
      title: string;
      number: number;
      keyPrefix: string;
    }>
  > {
    const rows = await this.db.execute<{
      organizationId: string;
      workItemId: string;
      assigneeId: string | null;
      dueDate: string;
      title: string;
      number: number;
      keyPrefix: string;
    }>(sql`
      select wi.organization_id as "organizationId",
             wi.id as "workItemId",
             wi.assignee_id as "assigneeId",
             to_char(wi.due_date, 'YYYY-MM-DD') as "dueDate",
             wi.title as "title",
             wi.number as "number",
             p.key_prefix as "keyPrefix"
        from ${workItems} wi
        join ${projects} p on p.id = wi.project_id
       where wi.deleted_at is null
         and wi.completed_at is null
         and wi.due_date is not null
         and wi.due_date <= (${today}::date + ${soonDays})
    `);
    return rows.rows;
  }

  /**
   * Version-checked field update in ONE transaction (FR-WI-009/D11): re-read the row
   * under the tx with the expected version, apply column changes + bump `version`, then
   * append one activity row per provided field change. A version mismatch throws
   * `VersionConflictError` (→ 409) and rolls back. Returns the updated row.
   */
  async updateFields(
    id: string,
    expectedVersion: number,
    columns: UpdateWorkItemColumns,
    changes: FieldChange[],
    actorId: string | null,
  ): Promise<CreatedWorkItem> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx): Promise<CreatedWorkItem> => {
      const [current] = await tx
        .select()
        .from(workItems)
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .limit(1);
      if (!current || current.deletedAt) {
        throw new Error(`work item ${id} not found in org`);
      }
      if (current.version !== expectedVersion) {
        throw new VersionConflictError(current.version);
      }

      const [item] = await tx
        .update(workItems)
        .set({
          ...columns,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .returning();
      if (!item) {
        throw new Error('failed to update work item');
      }

      if (changes.length > 0) {
        await tx.insert(activity).values(
          changes.map((c) => ({
            organizationId: orgId,
            workItemId: id,
            actorId,
            action: c.action ?? 'UPDATED',
            field: c.field,
            oldValue: c.oldValue ?? null,
            newValue: c.newValue ?? null,
          })),
        );
      }

      const [project] = await tx
        .select({ keyPrefix: projects.keyPrefix })
        .from(projects)
        .where(and(eq(projects.id, item.projectId), eq(projects.organizationId, orgId)))
        .limit(1);
      return { item, keyPrefix: project?.keyPrefix ?? '' };
    });
  }

  /**
   * Soft-delete (trash) an item: set `deleted_at`, bump `version`, append a DELETED
   * activity row — all in one tx. Default reads (findById) already exclude deleted rows.
   * The item's live children are promoted up to its own parent first, so no child is left
   * pointing at a trashed parent (FR-HIER-001); a restore brings the item back as a root/leaf.
   */
  async softDelete(id: string, actorId: string | null): Promise<void> {
    const orgId = this.tenant.getOrgId();
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          version: workItems.version,
          deletedAt: workItems.deletedAt,
          parentId: workItems.parentId,
        })
        .from(workItems)
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .limit(1);
      if (!current || current.deletedAt) {
        return; // already gone / not in org → idempotent no-op
      }
      // Re-parent the trashed item's live children to its own parent (may be null → they become
      // roots). One level up — they were already descendants of that ancestor, so no cycle, and
      // depth only decreases. Bump their version so a concurrent edit sees the move (409).
      await tx
        .update(workItems)
        .set({
          parentId: current.parentId,
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workItems.parentId, id),
            eq(workItems.organizationId, orgId),
            isNull(workItems.deletedAt),
          ),
        );
      await tx
        .update(workItems)
        .set({
          deletedAt: new Date(),
          version: sql`${workItems.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)));
      await tx.insert(activity).values({
        organizationId: orgId,
        workItemId: id,
        actorId,
        action: 'DELETED',
        field: null,
        oldValue: null,
        newValue: null,
      });
    });
  }

  /**
   * Restore a soft-deleted item: clear `deleted_at`, bump `version`, append a RESTORED
   * activity row. Comments + history are never deleted (FR-WI-008), so the item returns
   * intact. Returns the restored row + key prefix.
   */
  async restore(id: string, actorId: string | null): Promise<CreatedWorkItem | null> {
    const orgId = this.tenant.getOrgId();
    return this.db.transaction(async (tx): Promise<CreatedWorkItem | null> => {
      const [current] = await tx
        .select()
        .from(workItems)
        .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
        .limit(1);
      if (!current) return null;
      let item = current;
      if (current.deletedAt) {
        const [restored] = await tx
          .update(workItems)
          .set({
            deletedAt: null,
            version: sql`${workItems.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(workItems.id, id), eq(workItems.organizationId, orgId)))
          .returning();
        if (!restored) return null;
        item = restored;
        await tx.insert(activity).values({
          organizationId: orgId,
          workItemId: id,
          actorId,
          action: 'RESTORED',
          field: null,
          oldValue: null,
          newValue: null,
        });
      }
      const [project] = await tx
        .select({ keyPrefix: projects.keyPrefix })
        .from(projects)
        .where(and(eq(projects.id, item.projectId), eq(projects.organizationId, orgId)))
        .limit(1);
      return project ? { item, keyPrefix: project.keyPrefix } : null;
    });
  }
}
