import { z } from 'zod';

/**
 * Notifications DTOs (single contract source; OpenAPI `Notification`/`UpdateNotification`).
 * In-app inbox with read/unread, snooze, archive (FR-NOTIF-001/002, D10). US7 (T111).
 */

export const NOTIFICATION_TYPES = [
  'ASSIGNED',
  'MENTIONED',
  'COMMENTED',
  'STATUS_CHANGED',
  'DUE_SOON',
  'OVERDUE',
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** Inbox states selectable via `GET /notifications?state=`. */
export const NOTIFICATION_STATES = ['unread', 'all', 'snoozed', 'archived'] as const;

/** GET /notifications query params — inbox state + keyset pagination. */
export const listNotificationsQuerySchema = z
  .object({
    state: z.enum(NOTIFICATION_STATES).default('unread'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .strict();
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

/**
 * PATCH /notifications/{id} — mark read/unread, snooze (re-surfaces after the
 * timestamp), or archive. At least one field must be present (enforced in the
 * controller, not via a Zod `.refine` — TS2589). Unknown fields rejected (`.strict`).
 */
export const updateNotificationSchema = z
  .object({
    read: z.boolean().optional(),
    snoozedUntil: z.string().datetime().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type UpdateNotification = z.infer<typeof updateNotificationSchema>;

/** Notification response payload (OpenAPI `Notification`). */
export interface Notification {
  id: string;
  recipientId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  actorId: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  snoozedUntil: string | null;
  archivedAt: string | null;
  createdAt: string;
}

/** Single-notification envelope: `{ data }`. */
export interface NotificationEnvelope {
  data: Notification;
}

/** Notification-list (inbox) envelope: `{ data, pageInfo }`. */
export interface NotificationListResponse {
  data: Notification[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/** Unread-count badge response: `{ data: { count } }`. */
export interface UnreadCountResponse {
  data: { count: number };
}
