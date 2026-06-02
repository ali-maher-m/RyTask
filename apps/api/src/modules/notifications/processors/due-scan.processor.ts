import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import type { NotificationJobData } from './notifications.dispatch.processor';

/** Default look-ahead window for "due soon" (days). */
export const DUE_SOON_DAYS = 2;

/**
 * Computes the notification-dispatch jobs for today's due-soon / overdue items (FR-NOTIF-001) —
 * the time-windowed half of the spec that was previously never produced. It is deliberately free
 * of any queue/Redis dependency (so it is unit-testable and has no DI cycle with the queue): the
 * NotificationsQueue's daily repeatable worker calls this and enqueues each returned job. The
 * recipient is the assignee; the `kind:dueDate` bucket makes each item notify at most once per
 * day per transition (DUE_SOON, then OVERDUE), collapsing on the dispatch `dedupe_key`.
 */
@Injectable()
export class DueScanProcessor {
  constructor(
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async computeJobs(soonDays: number = DUE_SOON_DAYS): Promise<NotificationJobData[]> {
    const today = this.clock.now().toISOString().slice(0, 10);
    const due = await this.workItems.listDueAndOverdue(today, soonDays);
    const jobs: NotificationJobData[] = [];
    for (const d of due) {
      // Notify the assignee; an unassigned item has no recipient for a due reminder yet.
      if (!d.assigneeId) continue;
      jobs.push({
        organizationId: d.organizationId,
        type: d.kind,
        entityType: 'work_item',
        entityId: d.workItemId,
        actorId: null,
        recipientIds: [d.assigneeId],
        bucket: `${d.kind}:${d.dueDate}`,
        payload: { title: d.title, key: d.key, dueDate: d.dueDate },
      });
    }
    return jobs;
  }
}
