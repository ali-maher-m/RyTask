import { Inject, Injectable } from '@nestjs/common';
import { type Database, labels, workItemLabels } from '@rytask/db';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type LabelRow = typeof labels.$inferSelect;

/** Workspace-scoped labels (FR-LBL-001, D14). Quick-add applies-or-creates by name. */
@Injectable()
export class LabelsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  private workspaceId(): string {
    const ws = this.tenant.get().workspaceId;
    if (!ws) {
      throw new Error('No workspace in tenant context (labels are workspace-scoped).');
    }
    return ws;
  }

  /** Apply an existing label by name (case-insensitive) within the workspace, or create it. */
  async findOrCreateByName(name: string): Promise<string> {
    const orgId = this.tenant.getOrgId();
    const ws = this.workspaceId();
    const [existing] = await this.db
      .select({ id: labels.id })
      .from(labels)
      .where(
        and(
          eq(labels.organizationId, orgId),
          eq(labels.workspaceId, ws),
          sql`lower(${labels.name}) = lower(${name})`,
        ),
      )
      .limit(1);
    if (existing) {
      return existing.id;
    }
    const [created] = await this.db
      .insert(labels)
      .values({ organizationId: orgId, workspaceId: ws, name })
      .returning({ id: labels.id });
    if (!created) {
      throw new Error('failed to create label');
    }
    return created.id;
  }

  /** List labels in the current workspace. */
  async list(): Promise<LabelRow[]> {
    return this.db
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.organizationId, this.tenant.getOrgId()),
          eq(labels.workspaceId, this.workspaceId()),
        ),
      );
  }

  /** Create a label explicitly (POST /labels) with an optional color. */
  async create(name: string, color?: string): Promise<LabelRow> {
    const orgId = this.tenant.getOrgId();
    const ws = this.workspaceId();
    const [created] = await this.db
      .insert(labels)
      .values({ organizationId: orgId, workspaceId: ws, name, ...(color ? { color } : {}) })
      .returning();
    if (!created) {
      throw new Error('failed to create label');
    }
    return created;
  }

  /** A single label by id within the current workspace (or null). */
  async findById(id: string): Promise<LabelRow | null> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.organizationId, this.tenant.getOrgId()),
          eq(labels.workspaceId, this.workspaceId()),
          eq(labels.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Attach a label to a work item (idempotent — junction PK guards duplicates). */
  async attach(workItemId: string, labelId: string): Promise<void> {
    await this.db
      .insert(workItemLabels)
      .values({ organizationId: this.tenant.getOrgId(), workItemId, labelId })
      .onConflictDoNothing();
  }

  /** Detach a label from a work item (tenant-scoped, idempotent). */
  async detach(workItemId: string, labelId: string): Promise<void> {
    await this.db
      .delete(workItemLabels)
      .where(
        this.scoped(
          workItemLabels,
          eq(workItemLabels.workItemId, workItemId),
          eq(workItemLabels.labelId, labelId),
        ),
      );
  }

  /** Label ids attached to a work item (tenant-scoped). */
  async listForItem(workItemId: string): Promise<string[]> {
    const rows = await this.db
      .select({ labelId: workItemLabels.labelId })
      .from(workItemLabels)
      .where(this.scoped(workItemLabels, eq(workItemLabels.workItemId, workItemId)));
    return rows.map((r) => r.labelId);
  }
}
