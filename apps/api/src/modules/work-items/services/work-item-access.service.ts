import { Injectable } from '@nestjs/common';
import { ActivityRepository } from '../repositories/activity.repository';
import { WorkItemWatchersRepository } from '../repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import type {
  DueWorkItem,
  Watcher,
  WorkItemAccessService,
  WorkItemContext,
} from '../work-items.contract';

/**
 * Cross-module work-item access port (binds `WORK_ITEM_ACCESS`, Principle III). Lets the
 * comments + notifications modules touch `work_item_watchers` / `activity` (owned by
 * work-items, data-model §4) and check mention-granted read access — without importing
 * work-items internals. All reads/writes stay tenant-scoped via the underlying repos.
 */
@Injectable()
export class WorkItemAccessServiceImpl implements WorkItemAccessService {
  constructor(
    private readonly workItems: WorkItemsRepository,
    private readonly watchers: WorkItemWatchersRepository,
    private readonly activity: ActivityRepository,
  ) {}

  async getItemContext(workItemId: string): Promise<WorkItemContext | null> {
    const found = await this.workItems.findById(workItemId);
    if (!found) return null;
    const { item, keyPrefix } = found;
    return {
      id: item.id,
      projectId: item.projectId,
      assigneeId: item.assigneeId,
      reporterId: item.reporterId,
      title: item.title,
      key: `${keyPrefix}-${item.number}`,
    };
  }

  resolveMentions(handles: string[], projectId: string): Promise<string[]> {
    return this.watchers.resolveMentions(handles, projectId);
  }

  addMentionWatchers(workItemId: string, userIds: string[]): Promise<void> {
    return this.watchers.addMentioned(workItemId, userIds);
  }

  listWatchers(workItemId: string): Promise<Watcher[]> {
    return this.watchers.listForItem(workItemId);
  }

  mentionGrantedItemIds(userId: string): Promise<string[]> {
    return this.watchers.listMentionedItemIds(userId);
  }

  /** A member (any role) OR a MENTIONED watcher may read the item (FR-COLLAB-002). */
  async canAccess(workItemId: string, userId: string): Promise<boolean> {
    const ctx = await this.workItems.findById(workItemId);
    if (!ctx) return false;
    if (await this.watchers.isProjectMember(ctx.item.projectId, userId)) return true;
    return this.watchers.isMentionedWatcher(workItemId, userId);
  }

  async recordCommented(workItemId: string, actorId: string | null): Promise<void> {
    await this.activity.append({ workItemId, actorId, action: 'COMMENTED' });
  }

  /** SYSTEM read-model for the scheduled due scan — classify each candidate + build its key. */
  async listDueAndOverdue(today: string, soonDays: number): Promise<DueWorkItem[]> {
    const rows = await this.workItems.listDueAndOverdue(today, soonDays);
    return rows.map((r) => ({
      organizationId: r.organizationId,
      workItemId: r.workItemId,
      assigneeId: r.assigneeId,
      dueDate: r.dueDate,
      title: r.title,
      key: `${r.keyPrefix}-${r.number}`,
      // Lexicographic compare is correct for `YYYY-MM-DD`: a past due date is OVERDUE, else DUE_SOON.
      kind: r.dueDate < today ? 'OVERDUE' : 'DUE_SOON',
    }));
  }
}
