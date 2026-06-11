import { Injectable } from '@nestjs/common';
import type { CompletedItemRow } from '@rytask/contracts';
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
      workspaceId: item.workspaceId,
      projectId: item.projectId,
      assigneeId: item.assigneeId,
      reporterId: item.reporterId,
      title: item.title,
      key: `${keyPrefix}-${item.number}`,
      // The priority snapshot drives a new time entry's default classification (M2 US5, research D6).
      priority: item.priority,
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

  // M2 time events in the per-item activity feed (activity-and-source.md §1.2/§1.3). The
  // time-tracking module appends through these (the `recordCommented` pattern) — never by touching
  // `ActivityRepository`, which work-items owns (Principle III). All stay tenant-scoped via the repo.

  async recordTimeStarted(
    workItemId: string,
    actorId: string | null,
    startedAt: string,
  ): Promise<void> {
    await this.activity.append({
      workItemId,
      actorId,
      action: 'TIME_STARTED',
      newValue: { startedAt },
    });
  }

  async recordTimeStopped(
    workItemId: string,
    actorId: string | null,
    durationSeconds: number,
  ): Promise<void> {
    await this.activity.append({
      workItemId,
      actorId,
      action: 'TIME_STOPPED',
      newValue: { durationSeconds },
    });
  }

  async recordTimeLogged(
    workItemId: string,
    actorId: string | null,
    durationSeconds: number,
  ): Promise<void> {
    await this.activity.append({
      workItemId,
      actorId,
      action: 'TIME_LOGGED',
      newValue: { durationSeconds },
    });
  }

  async recordTimeEdited(
    workItemId: string,
    actorId: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.activity.append({
      workItemId,
      actorId,
      action: 'TIME_EDITED',
      oldValue: before,
      newValue: after,
    });
  }

  async recordTimeDeleted(
    workItemId: string,
    actorId: string | null,
    before: unknown,
  ): Promise<void> {
    await this.activity.append({
      workItemId,
      actorId,
      action: 'TIME_DELETED',
      oldValue: before,
    });
  }

  /**
   * "Completed that week" — non-deleted items assigned to the subject with `completed_at` in the
   * window ∩ readable projects (M4 reporting US3, research D6). Pure work-item lifecycle read; the
   * repo row already matches `CompletedItemRow`, so it passes straight through (tenant-scoped).
   */
  listCompletedForUser(
    userId: string,
    from: string,
    to: string,
    projectIds: string[] | null,
  ): Promise<CompletedItemRow[]> {
    return this.workItems.listCompletedForUser(userId, from, to, projectIds);
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
