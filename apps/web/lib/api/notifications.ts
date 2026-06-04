'use client';

import type {
  Notification,
  NotificationEnvelope,
  NotificationListResponse,
  UnreadCountResponse,
  UpdateNotification,
} from '@rytask/contracts';
import { authedRequest } from './http';

/** Notifications (inbox) resource module (D8). List by state, unread badge, read/snooze/archive. */

export type InboxStateFilter = 'unread' | 'all' | 'snoozed' | 'archived';

/** GET /notifications?state= — one keyset page of the inbox in the given state. */
export async function listNotifications(
  state: InboxStateFilter = 'unread',
  cursor?: string,
): Promise<NotificationListResponse> {
  const params = new URLSearchParams({ state, limit: '50' });
  if (cursor) params.set('cursor', cursor);
  return authedRequest<NotificationListResponse>(`/notifications?${params.toString()}`);
}

/** GET /notifications/unread-count — the unread badge count. */
export async function getUnreadCount(): Promise<number> {
  const body = await authedRequest<UnreadCountResponse>('/notifications/unread-count');
  return body.data.count;
}

/** PATCH /notifications/{id} — mark read/unread, snooze (re-surfaces), or archive. */
export async function updateNotification(
  id: string,
  input: UpdateNotification,
): Promise<Notification> {
  const body = await authedRequest<NotificationEnvelope>(`/notifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}
