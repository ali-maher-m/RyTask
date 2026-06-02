import { Inject, Injectable } from '@nestjs/common';
import { type Database, projectMembers, projects, users } from '@rytask/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { ProjectRole } from '../projects.contract';

/** A project member joined with the user's display name (for the members list). */
export interface MemberRow {
  userId: string;
  role: ProjectRole;
  name: string;
}

/** Tenant-scoped reads/writes over `project_members` (data-model §2.2). */
@Injectable()
export class ProjectMembersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** The user's role in a project (tenant-scoped), or null if not a member. */
  async findRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const rows = await this.db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        this.scoped(
          projectMembers,
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);
    return (rows[0]?.role as ProjectRole | undefined) ?? null;
  }

  /** All project ids the user belongs to (tenant-scoped). */
  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(this.scoped(projectMembers, eq(projectMembers.userId, userId)));
    return rows.map((r) => r.projectId);
  }

  /**
   * Every project id in the org (tenant-scoped) — the accessible set for an org OWNER/ADMIN, who
   * may read any project (FR-PROJ-002) even without an explicit membership. Reads the `projects`
   * table (same module) so a project with no members is still included.
   */
  async listAllProjectIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(this.scoped(projects));
    return rows.map((r) => r.id);
  }

  /** Add (or no-op upsert) a membership row. */
  async add(projectId: string, userId: string, role: ProjectRole): Promise<void> {
    await this.db
      .insert(projectMembers)
      .values({ organizationId: this.tenant.getOrgId(), projectId, userId, role })
      .onConflictDoNothing();
  }

  /** Members of a project (tenant-scoped) with display names, ordered by user id. */
  async listForProject(projectId: string): Promise<MemberRow[]> {
    const rows = await this.db
      .select({ userId: projectMembers.userId, role: projectMembers.role, name: users.name })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(this.scoped(projectMembers, eq(projectMembers.projectId, projectId)))
      .orderBy(asc(projectMembers.userId));
    return rows.map((r) => ({ userId: r.userId, role: r.role as ProjectRole, name: r.name }));
  }
}
