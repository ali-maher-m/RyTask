import { Inject, Injectable } from '@nestjs/common';
import { type Database, activity } from '@rytask/db';
import { eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type ActivityRow = typeof activity.$inferSelect;
export type ActivityAction = ActivityRow['action'];

export interface ActivityEntryInput {
  workItemId: string;
  actorId?: string | null;
  action: ActivityAction;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/** Append-only per-item activity log (FR-WI-009, D11). No update/delete path. */
@Injectable()
export class ActivityRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Append one or more activity entries (used by update/move/delete providers). */
  async append(entries: ActivityEntryInput | ActivityEntryInput[]): Promise<void> {
    const orgId = this.tenant.getOrgId();
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0) return;
    await this.db.insert(activity).values(
      list.map((e) => ({
        organizationId: orgId,
        workItemId: e.workItemId,
        actorId: e.actorId ?? null,
        action: e.action,
        field: e.field ?? null,
        oldValue: e.oldValue ?? null,
        newValue: e.newValue ?? null,
      })),
    );
  }

  /** Chronological activity feed for an item (tenant-scoped). */
  async listForItem(workItemId: string): Promise<ActivityRow[]> {
    return this.db
      .select()
      .from(activity)
      .where(this.scoped(activity, eq(activity.workItemId, workItemId)))
      .orderBy(activity.createdAt);
  }
}
