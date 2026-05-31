import { Inject, Injectable } from '@nestjs/common';
import { type Database, statuses, workItems } from '@rytask/db';
import { and, asc, eq, max, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import { DEFAULT_STATUSES } from './seed-default-statuses';

export type StatusRow = typeof statuses.$inferSelect;
export type StatusCategory = StatusRow['category'];

export interface CreateStatusData {
  projectId: string;
  name: string;
  category: StatusCategory;
  color?: string;
  position?: number;
}

export interface UpdateStatusColumns {
  name?: string;
  category?: StatusCategory;
  color?: string;
}

/**
 * Tenant-scoped reads/writes over `statuses` (data-model §2.4, FR-WF-001/002). Owns the
 * board-column ordering, the default-status seed on project create, and the atomic
 * delete-with-remap (re-point items → reassignTo in ONE transaction so items are never
 * orphaned and a project always keeps ≥1 status — the provider enforces those rules).
 */
@Injectable()
export class StatusesRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** All statuses for a project, ordered by board position (tenant-scoped). */
  async listForProject(projectId: string): Promise<StatusRow[]> {
    return this.db
      .select()
      .from(statuses)
      .where(this.scoped(statuses, eq(statuses.projectId, projectId)))
      .orderBy(asc(statuses.position));
  }

  /** A single status by id (tenant-scoped), or null. */
  async findById(id: string): Promise<StatusRow | null> {
    const [row] = await this.db
      .select()
      .from(statuses)
      .where(this.scoped(statuses, eq(statuses.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** Seed the six categorized default statuses for a new project (reused by US4 + DB seed). */
  async seedDefaults(projectId: string): Promise<void> {
    const orgId = this.tenant.getOrgId();
    await this.db
      .insert(statuses)
      .values(
        DEFAULT_STATUSES.map((s) => ({
          organizationId: orgId,
          projectId,
          name: s.name,
          category: s.category,
          color: s.color,
          position: s.position,
        })),
      )
      .onConflictDoNothing();
  }

  /** Append a status at the end of the board (position = max+1) unless one is supplied. */
  async create(data: CreateStatusData): Promise<StatusRow> {
    const orgId = this.tenant.getOrgId();
    let position = data.position;
    if (position === undefined) {
      const [row] = await this.db
        .select({ max: max(statuses.position) })
        .from(statuses)
        .where(this.scoped(statuses, eq(statuses.projectId, data.projectId)));
      position = (row?.max ?? -1) + 1;
    }
    const [created] = await this.db
      .insert(statuses)
      .values({
        organizationId: orgId,
        projectId: data.projectId,
        name: data.name,
        category: data.category,
        ...(data.color ? { color: data.color } : {}),
        position,
      })
      .returning();
    if (!created) {
      throw new Error('failed to create status');
    }
    return created;
  }

  /** Rename / recolor / recategorize a status (tenant-scoped). Returns the updated row. */
  async update(id: string, columns: UpdateStatusColumns): Promise<StatusRow | null> {
    const [row] = await this.db
      .update(statuses)
      .set({ ...columns, updatedAt: new Date() })
      .where(this.scoped(statuses, eq(statuses.id, id)))
      .returning();
    return row ?? null;
  }

  /** Apply a total ordering: set each status's `position` to its index in `orderedIds`. */
  async reorder(projectId: string, orderedIds: string[]): Promise<void> {
    const orgId = this.tenant.getOrgId();
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(statuses)
          .set({ position: i, updatedAt: new Date() })
          .where(
            and(
              eq(statuses.id, orderedIds[i] as string),
              eq(statuses.projectId, projectId),
              eq(statuses.organizationId, orgId),
            ),
          );
      }
    });
  }

  /** Count statuses in a project (for the min-one rule). */
  async countForProject(projectId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(statuses)
      .where(this.scoped(statuses, eq(statuses.projectId, projectId)));
    return row?.count ?? 0;
  }

  /** Count work items currently in a status (for the delete-remap rule; excludes deleted). */
  async itemCount(statusId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workItems)
      .where(
        this.scoped(
          workItems,
          eq(workItems.statusId, statusId),
          sql`${workItems.deletedAt} is null`,
        ),
      );
    return row?.count ?? 0;
  }

  /**
   * Delete a status, re-pointing its items to `reassignTo` first — both in ONE transaction
   * (data-model §2.4). The provider has already validated the min-one + reassign rules.
   * When `reassignTo` is null the status is assumed empty.
   */
  async deleteWithRemap(id: string, reassignTo: string | null): Promise<void> {
    const orgId = this.tenant.getOrgId();
    await this.db.transaction(async (tx) => {
      if (reassignTo) {
        await tx
          .update(workItems)
          .set({ statusId: reassignTo, updatedAt: new Date() })
          .where(and(eq(workItems.statusId, id), eq(workItems.organizationId, orgId)));
      }
      await tx.delete(statuses).where(and(eq(statuses.id, id), eq(statuses.organizationId, orgId)));
    });
  }
}
