import { Inject, Injectable } from '@nestjs/common';
import { type Database, projectCounters, projectMembers, projects, statuses } from '@rytask/db';
import { type SQL, asc, eq, gt, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { ProjectRole } from '../projects.contract';
import { DEFAULT_STATUSES } from './seed-default-statuses';

export type ProjectRow = typeof projects.$inferSelect;

export interface CreateProjectColumns {
  name: string;
  keyPrefix: string;
  description?: string | null;
  icon?: string | null;
  color?: string;
  leadId?: string | null;
}

export interface UpdateProjectColumns {
  name?: string;
  description?: string | null;
  icon?: string | null;
  color?: string;
  leadId?: string | null;
  /** Set/clear the archive timestamp (archive ⇄ restore). */
  archivedAt?: Date | null;
}

/**
 * Tenant-scoped reads/writes over `projects` (data-model §2.1, FR-PROJ-001). The create is
 * a low-level insert; the full create (counter + statuses + creator membership) is composed
 * in ONE transaction by the create-project provider via {@link createTx}. Archived projects
 * (`archived_at` set) are hidden from default lists but retained.
 */
@Injectable()
export class ProjectsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** A single project by id (tenant-scoped), or null. */
  async findById(id: string): Promise<ProjectRow | null> {
    const [row] = await this.db
      .select()
      .from(projects)
      .where(this.scoped(projects, eq(projects.id, id)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Keyset page of the workspace's projects (id asc — UUIDv7 is creation-ordered). Excludes
   * archived projects unless `includeArchived`. One extra row is fetched so the caller can
   * compute `hasNextPage` cheaply.
   */
  async listForWorkspace(opts: {
    workspaceId: string;
    limit: number;
    cursorId?: string;
    includeArchived: boolean;
  }): Promise<ProjectRow[]> {
    const extra: SQL[] = [eq(projects.workspaceId, opts.workspaceId)];
    if (!opts.includeArchived) {
      extra.push(isNull(projects.archivedAt));
    }
    if (opts.cursorId) {
      extra.push(gt(projects.id, opts.cursorId));
    }
    return this.db
      .select()
      .from(projects)
      .where(this.scoped(projects, ...extra))
      .orderBy(asc(projects.id))
      .limit(opts.limit + 1);
  }

  /**
   * Create a project end-to-end in ONE transaction (FR-PROJ-001, data-model §2): insert the
   * project → seed its `project_counter` at 0 → seed the six categorized default statuses
   * (mirrors {@link DEFAULT_STATUSES} / the DB seed) → record the creator's ADMIN membership.
   * A duplicate `(org, workspace, key_prefix)` raises a unique-violation that rolls the whole
   * tx back (the provider maps it to 409). `creatorId` is the acting principal (or null).
   */
  async createTx(data: CreateProjectColumns, creatorId: string | null): Promise<ProjectRow> {
    const orgId = this.tenant.getOrgId();
    const workspaceId = this.requireWorkspaceId();
    return this.db.transaction(async (tx): Promise<ProjectRow> => {
      const [project] = await tx
        .insert(projects)
        .values({
          organizationId: orgId,
          workspaceId,
          name: data.name,
          keyPrefix: data.keyPrefix,
          description: data.description ?? null,
          icon: data.icon ?? null,
          ...(data.color ? { color: data.color } : {}),
          leadId: data.leadId ?? null,
        })
        .returning();
      if (!project) {
        throw new Error('failed to create project');
      }

      await tx.insert(projectCounters).values({
        projectId: project.id,
        organizationId: orgId,
        lastNumber: 0,
      });

      await tx.insert(statuses).values(
        DEFAULT_STATUSES.map((s) => ({
          organizationId: orgId,
          projectId: project.id,
          name: s.name,
          category: s.category,
          color: s.color,
          position: s.position,
        })),
      );

      if (creatorId) {
        await tx
          .insert(projectMembers)
          .values({
            organizationId: orgId,
            projectId: project.id,
            userId: creatorId,
            role: 'ADMIN' as ProjectRole,
          })
          .onConflictDoNothing();
      }

      return project;
    });
  }

  /** Update project columns (tenant-scoped). Returns the updated row, or null if not found. */
  async update(id: string, columns: UpdateProjectColumns): Promise<ProjectRow | null> {
    const [row] = await this.db
      .update(projects)
      .set({ ...columns, updatedAt: new Date() })
      .where(this.scoped(projects, eq(projects.id, id)))
      .returning();
    return row ?? null;
  }

  /** Hard-delete a project (FK cascades remove members/counter/statuses/items). Tenant-scoped. */
  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(projects)
      .where(this.scoped(projects, eq(projects.id, id)))
      .returning({ id: projects.id });
    return rows.length > 0;
  }

  private requireWorkspaceId(): string {
    const ws = this.tenant.get().workspaceId;
    if (!ws) {
      throw new Error('No workspace in tenant context');
    }
    return ws;
  }
}
