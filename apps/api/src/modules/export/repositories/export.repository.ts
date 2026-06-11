import { Inject, Injectable } from '@nestjs/common';
import {
  type Comment,
  type Database,
  type Label,
  type Organization,
  type Project,
  type Status,
  type TimeLog,
  type WorkItem,
  type Workspace,
  comments,
  labels,
  memberships,
  organizations,
  projects,
  statuses,
  timeLogs,
  users,
  workItemLabels,
  workItems,
  workspaces,
} from '@rytask/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/** A membership row joined with its user — the export's "members" section. */
export interface MemberExportRow {
  userId: string;
  email: string;
  name: string;
  role: string;
  deactivatedAt: Date | null;
  createdAt: Date;
}

/** A work item joined with its project's key prefix (for the human `RY-12` key). */
export interface WorkItemExportRow {
  item: WorkItem;
  keyPrefix: string;
}

/**
 * Read-only, tenant-scoped snapshot reads for the full workspace export (M5, FR-PORT-003/004).
 * A read-model over the shared Drizzle schema — the M4 reporting precedent: this module OWNS no
 * tables and WRITES nothing; every query inherits the mandatory org scope from
 * `TenantScopedRepository`. Soft-deleted rows are INCLUDED (with `deleted_at`) — a complete
 * archive, not a filtered view. Ordering is stable (UUIDv7 ids are time-sortable) so two exports
 * of the same data are byte-identical.
 */
@Injectable()
export class ExportRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** The tenant root row itself. */
  async organization(): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, this.tenant.getOrgId()))
      .limit(1);
    return row ?? null;
  }

  async workspaces(): Promise<Workspace[]> {
    return this.db
      .select()
      .from(workspaces)
      .where(this.orgScope(workspaces))
      .orderBy(asc(workspaces.id));
  }

  async members(): Promise<MemberExportRow[]> {
    return this.db
      .select({
        userId: memberships.userId,
        email: users.email,
        name: users.name,
        role: memberships.role,
        deactivatedAt: memberships.deactivatedAt,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(this.orgScope(memberships))
      .orderBy(asc(memberships.id));
  }

  async projects(): Promise<Project[]> {
    return this.db.select().from(projects).where(this.orgScope(projects)).orderBy(asc(projects.id));
  }

  async statuses(): Promise<Status[]> {
    return this.db.select().from(statuses).where(this.orgScope(statuses)).orderBy(asc(statuses.id));
  }

  async labels(): Promise<Label[]> {
    return this.db.select().from(labels).where(this.orgScope(labels)).orderBy(asc(labels.id));
  }

  /** ALL work items (soft-deleted included) with their project key prefix. */
  async workItems(): Promise<WorkItemExportRow[]> {
    return this.db
      .select({ item: workItems, keyPrefix: projects.keyPrefix })
      .from(workItems)
      .innerJoin(projects, eq(projects.id, workItems.projectId))
      .where(this.orgScope(workItems))
      .orderBy(asc(workItems.id));
  }

  /** The item↔label m2m, for nesting `labelIds` into each exported item. */
  async workItemLabels(): Promise<Array<{ workItemId: string; labelId: string }>> {
    return this.db
      .select({ workItemId: workItemLabels.workItemId, labelId: workItemLabels.labelId })
      .from(workItemLabels)
      .where(this.orgScope(workItemLabels))
      .orderBy(asc(workItemLabels.workItemId), asc(workItemLabels.labelId));
  }

  /** ALL comments (soft-deleted included). */
  async comments(): Promise<Comment[]> {
    return this.db.select().from(comments).where(this.orgScope(comments)).orderBy(asc(comments.id));
  }

  /** ALL time logs (soft-deleted included). */
  async timeLogs(): Promise<TimeLog[]> {
    return this.db.select().from(timeLogs).where(this.orgScope(timeLogs)).orderBy(asc(timeLogs.id));
  }
}
