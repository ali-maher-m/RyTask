import { Inject, Injectable } from '@nestjs/common';
import { type Database, views } from '@rytask/db';
import { type SQL, and, eq, inArray, isNull, or } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type ViewRow = typeof views.$inferSelect;

/** Column values for a new saved view (already validated/coerced by the provider). */
export interface CreateViewData {
  ownerId: string;
  projectId?: string | null;
  name: string;
  kind: ViewRow['kind'];
  scope: ViewRow['scope'];
  filters?: unknown;
  grouping?: unknown;
  sort?: unknown;
  layout?: unknown;
}

/** Mutable columns of a saved view (PATCH). Only provided keys are written. */
export interface UpdateViewColumns {
  name?: string;
  kind?: ViewRow['kind'];
  scope?: ViewRow['scope'];
  filters?: unknown;
  grouping?: unknown;
  sort?: unknown;
  layout?: unknown;
}

/**
 * Tenant-scoped reads/writes over `views` (data-model §2.10, FR-VIEW-008). The
 * visibility policy — PERSONAL views to their owner only, SHARED views to project
 * members — is enforced by the provider (which owns the project-access port); this
 * repository just supplies the tenant-scoped SQL. Smart views + My Work are NOT rows
 * (D7) and never touch this table.
 */
@Injectable()
export class ViewsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a saved view (tenant-scoped). Returns the persisted row. */
  async create(data: CreateViewData): Promise<ViewRow> {
    const orgId = this.tenant.getOrgId();
    const [created] = await this.db
      .insert(views)
      .values({
        organizationId: orgId,
        ownerId: data.ownerId,
        projectId: data.projectId ?? null,
        name: data.name,
        kind: data.kind,
        scope: data.scope,
        ...(data.filters !== undefined ? { filters: data.filters } : {}),
        ...(data.grouping !== undefined ? { grouping: data.grouping } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
        ...(data.layout !== undefined ? { layout: data.layout } : {}),
      })
      .returning();
    if (!created) {
      throw new Error('failed to create view');
    }
    return created;
  }

  /** A single saved view by id (tenant-scoped), or null. Visibility is enforced upstream. */
  async findById(id: string): Promise<ViewRow | null> {
    const [row] = await this.db
      .select()
      .from(views)
      .where(this.scoped(views, eq(views.id, id)))
      .limit(1);
    return row ?? null;
  }

  /**
   * The views VISIBLE to the principal (FR-VIEW-008): every PERSONAL view they own, plus
   * every SHARED view homed in a project they can access (`accessibleProjectIds`) or a
   * cross-project SHARED view (null project). Optionally narrowed to one `projectId`
   * (a `null` cross-project view always passes the project filter). Ordered by creation.
   */
  async listVisible(opts: {
    ownerId: string;
    accessibleProjectIds: string[];
    projectId?: string;
  }): Promise<ViewRow[]> {
    const sharedScope: SQL = opts.accessibleProjectIds.length
      ? (or(isNull(views.projectId), inArray(views.projectId, opts.accessibleProjectIds)) as SQL)
      : isNull(views.projectId);
    const visible = or(
      eq(views.ownerId, opts.ownerId),
      and(eq(views.scope, 'SHARED'), sharedScope),
    ) as SQL;

    const projectFilter = opts.projectId
      ? (or(isNull(views.projectId), eq(views.projectId, opts.projectId)) as SQL)
      : undefined;

    const rows = await this.db
      .select()
      .from(views)
      .where(this.scoped(views, visible, projectFilter))
      .orderBy(views.createdAt);
    return rows;
  }

  /** Apply a partial update to a saved view (tenant-scoped). Returns the updated row or null. */
  async update(id: string, columns: UpdateViewColumns): Promise<ViewRow | null> {
    const [row] = await this.db
      .update(views)
      .set({ ...columns, updatedAt: new Date() })
      .where(this.scoped(views, eq(views.id, id)))
      .returning();
    return row ?? null;
  }

  /** Delete a saved view (tenant-scoped, idempotent). */
  async delete(id: string): Promise<void> {
    await this.db.delete(views).where(this.scoped(views, eq(views.id, id)));
  }
}
