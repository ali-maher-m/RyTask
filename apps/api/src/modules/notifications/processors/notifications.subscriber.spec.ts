import { describe, expect, it, vi } from 'vitest';
import type { WorkItemAccessService } from '../../work-items/work-items.contract';
import type { NotificationJobData } from './notifications.dispatch.processor';
import type { NotificationsQueue } from './notifications.queue';
import { NotificationsSubscriber } from './notifications.subscriber';

/**
 * Unit tests for the event → dispatch-job fan-out (US7, FR-NOTIF-001). The previously-missing
 * `work-item.changed` handler must enqueue STATUS_CHANGED to watchers and ASSIGNED to a new
 * assignee — and nothing for an edit that touched neither.
 */
function makeSubscriber(watcherIds: string[]) {
  const enqueued: NotificationJobData[] = [];
  const queue = {
    enqueue: vi.fn(async (data: NotificationJobData) => {
      enqueued.push(data);
    }),
  } as unknown as NotificationsQueue;
  const workItems = {
    getItemContext: vi.fn(async () => ({
      id: 'wi-1',
      projectId: 'p-1',
      assigneeId: null,
      reporterId: null,
      title: 'Ship it',
      key: 'RY-1',
    })),
    listWatchers: vi.fn(async () =>
      watcherIds.map((userId) => ({ userId, reason: 'AUTHOR' as const })),
    ),
  } as unknown as WorkItemAccessService;
  return { subscriber: new NotificationsSubscriber(queue, workItems), enqueued };
}

const baseEvent = {
  workItemId: 'wi-1',
  organizationId: 'org-1',
  actorId: 'actor-1',
  assigneeId: null as string | null,
  version: 7,
  changedFields: [] as string[],
};

describe('NotificationsSubscriber.onWorkItemChanged', () => {
  it('enqueues STATUS_CHANGED to the watchers on a status change', async () => {
    const { subscriber, enqueued } = makeSubscriber(['w1', 'w2']);
    await subscriber.onWorkItemChanged({ ...baseEvent, changedFields: ['statusId'] });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      type: 'STATUS_CHANGED',
      recipientIds: ['w1', 'w2'],
      bucket: 'status:7',
      actorId: 'actor-1',
    });
  });

  it('enqueues ASSIGNED to a newly-assigned user', async () => {
    const { subscriber, enqueued } = makeSubscriber([]);
    await subscriber.onWorkItemChanged({
      ...baseEvent,
      assigneeId: 'new-assignee',
      changedFields: ['assigneeId'],
    });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      type: 'ASSIGNED',
      recipientIds: ['new-assignee'],
      bucket: 'assign:7',
    });
  });

  it('enqueues both a status and an assignment job when both change', async () => {
    const { subscriber, enqueued } = makeSubscriber(['w1']);
    await subscriber.onWorkItemChanged({
      ...baseEvent,
      assigneeId: 'a2',
      changedFields: ['statusId', 'assigneeId'],
    });
    expect(enqueued.map((e) => e.type).sort()).toEqual(['ASSIGNED', 'STATUS_CHANGED']);
  });

  it('does nothing for an edit that changed neither status nor assignee', async () => {
    const { subscriber, enqueued } = makeSubscriber(['w1']);
    await subscriber.onWorkItemChanged({ ...baseEvent, changedFields: ['title', 'priority'] });
    expect(enqueued).toHaveLength(0);
  });

  it('does not enqueue ASSIGNED when the assignee was cleared (no new assignee)', async () => {
    const { subscriber, enqueued } = makeSubscriber([]);
    await subscriber.onWorkItemChanged({
      ...baseEvent,
      assigneeId: null,
      changedFields: ['assigneeId'],
    });
    expect(enqueued).toHaveLength(0);
  });
});

describe('NotificationsSubscriber.onWorkItemMentioned', () => {
  it('enqueues MENTIONED to the description-mentioned users, bucketed by edit version', async () => {
    const { subscriber, enqueued } = makeSubscriber([]);
    await subscriber.onWorkItemMentioned({
      organizationId: 'org-1',
      workItemId: 'wi-1',
      actorId: 'actor-1',
      version: 4,
      mentionedUserIds: ['m1', 'm2'],
    });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      type: 'MENTIONED',
      recipientIds: ['m1', 'm2'],
      bucket: 'desc:4',
      actorId: 'actor-1',
    });
  });

  it('does nothing when there are no mentioned users', async () => {
    const { subscriber, enqueued } = makeSubscriber([]);
    await subscriber.onWorkItemMentioned({
      organizationId: 'org-1',
      workItemId: 'wi-1',
      actorId: 'actor-1',
      version: 4,
      mentionedUserIds: [],
    });
    expect(enqueued).toHaveLength(0);
  });
});
