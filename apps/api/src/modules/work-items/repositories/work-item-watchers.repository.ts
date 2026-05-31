import { Inject, Injectable } from '@nestjs/common';
import { type Database, projectMembers, users, workItemWatchers } from '@rytask/db';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { Watcher, WatcherReason } from '../work-items.contract';

/**
 * Tenant-scoped reads/writes for `work_item_watchers` (owned by work-items, data-model
 * §4). Drives notification fan-out and mention-granted context access (D9). The comments
 * and notifications modules reach this ONLY via `work-items.contract.ts`.
 */
@Injectable()
export class WorkItemWatchersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Seed MENTIONED watcher rows for an item (idempotent — PK guards duplicates). */
  async addMentioned(workItemId: string, userIds: string[]): Promise<void> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const orgId = this.tenant.getOrgId();
    await this.db
      .insert(workItemWatchers)
      .values(
        ids.map((userId) => ({
          organizationId: orgId,
          workItemId,
          userId,
          reason: 'MENTIONED' as WatcherReason,
        })),
      )
      .onConflictDoNothing();
  }

  /** All watchers of an item (tenant-scoped). */
  async listForItem(workItemId: string): Promise<Watcher[]> {
    const rows = await this.db
      .select({ userId: workItemWatchers.userId, reason: workItemWatchers.reason })
      .from(workItemWatchers)
      .where(this.scoped(workItemWatchers, eq(workItemWatchers.workItemId, workItemId)));
    return rows.map((r) => ({ userId: r.userId, reason: r.reason as WatcherReason }));
  }

  /** True if the user is a MENTIONED watcher of the item (tenant-scoped, FR-COLLAB-002). */
  async isMentionedWatcher(workItemId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: workItemWatchers.userId })
      .from(workItemWatchers)
      .where(
        this.scoped(
          workItemWatchers,
          eq(workItemWatchers.workItemId, workItemId),
          eq(workItemWatchers.userId, userId),
          eq(workItemWatchers.reason, 'MENTIONED'),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** True if the user holds any role in the given project (tenant-scoped). */
  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.organizationId, this.tenant.getOrgId()),
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Resolve quick-add `@handle`s to project-member user ids (by name or email
   * local-part, case-insensitive), preserving first-seen order. Non-members are
   * silently dropped (the caller surfaces unresolved mentions if it cares).
   */
  async resolveMentions(handles: string[], projectId: string): Promise<string[]> {
    const distinct = [...new Set(handles.map((h) => h.toLowerCase()))];
    if (distinct.length === 0) return [];
    const orgId = this.tenant.getOrgId();
    const rows = await this.db
      .select({
        userId: users.id,
        name: sql<string>`lower(${users.name})`,
        local: sql<string>`lower(split_part(${users.email}, '@', 1))`,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(eq(projectMembers.organizationId, orgId), eq(projectMembers.projectId, projectId)),
      );

    const byHandle = new Map<string, string>();
    for (const r of rows) {
      if (!byHandle.has(r.name)) byHandle.set(r.name, r.userId);
      if (!byHandle.has(r.local)) byHandle.set(r.local, r.userId);
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const handle of distinct) {
      const userId = byHandle.get(handle);
      if (userId && !seen.has(userId)) {
        seen.add(userId);
        out.push(userId);
      }
    }
    return out;
  }
}
