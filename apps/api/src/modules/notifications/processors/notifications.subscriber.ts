import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { NotificationsQueue } from './notifications.queue';

/**
 * Bridges domain events → notification-dispatch jobs (US7, D10). Runs in the API process
 * (it has request context to fan out over watchers via the work-items contract), then
 * enqueues a single job whose `recipientIds` are already resolved — the worker side then
 * only plans + writes (exactly-once via `dedupe_key`).
 *
 * Consumed events (named to match the emitters so no work-items internals are imported):
 *   - `work-item.created`  → ASSIGNED to the assignee (if any).
 *   - `comment.created`    → COMMENTED to every watcher (author suppressed in the policy).
 *   - `user.mentioned`     → MENTIONED to the resolved mentioned users.
 */
@Injectable()
export class NotificationsSubscriber {
  constructor(
    private readonly queue: NotificationsQueue,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
  ) {}

  @OnEvent('work-item.created')
  async onWorkItemCreated(event: {
    workItemId: string;
    organizationId: string;
    actorId: string | null;
    assigneeId: string | null;
  }): Promise<void> {
    if (!event.assigneeId) return;
    const ctx = await this.workItems.getItemContext(event.workItemId);
    await this.queue.enqueue({
      organizationId: event.organizationId,
      type: 'ASSIGNED',
      entityType: 'work_item',
      entityId: event.workItemId,
      actorId: event.actorId,
      recipientIds: [event.assigneeId],
      payload: ctx ? { title: ctx.title, key: ctx.key } : {},
    });
  }

  @OnEvent('comment.created')
  async onCommentAdded(event: {
    commentId: string;
    organizationId: string;
    workItemId: string;
    authorId: string;
  }): Promise<void> {
    const ctx = await this.workItems.getItemContext(event.workItemId);
    const watchers = await this.workItems.listWatchers(event.workItemId);
    const recipientIds = watchers.map((w) => w.userId);
    if (recipientIds.length === 0) return;
    await this.queue.enqueue({
      organizationId: event.organizationId,
      type: 'COMMENTED',
      entityType: 'work_item',
      entityId: event.workItemId,
      actorId: event.authorId,
      recipientIds,
      // One COMMENTED row per recipient per comment (the comment id is the bucket).
      bucket: event.commentId,
      payload: ctx ? { title: ctx.title, key: ctx.key, commentId: event.commentId } : {},
    });
  }

  @OnEvent('user.mentioned')
  async onUserMentioned(event: {
    organizationId: string;
    workItemId: string;
    commentId: string;
    actorId: string;
    mentionedUserIds: string[];
  }): Promise<void> {
    if (event.mentionedUserIds.length === 0) return;
    const ctx = await this.workItems.getItemContext(event.workItemId);
    await this.queue.enqueue({
      organizationId: event.organizationId,
      type: 'MENTIONED',
      entityType: 'work_item',
      entityId: event.workItemId,
      actorId: event.actorId,
      recipientIds: event.mentionedUserIds,
      bucket: event.commentId,
      payload: ctx ? { title: ctx.title, key: ctx.key, commentId: event.commentId } : {},
    });
  }
}
