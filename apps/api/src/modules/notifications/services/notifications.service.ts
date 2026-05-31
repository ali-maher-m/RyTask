import { Injectable } from '@nestjs/common';
import type {
  ListNotificationsQuery,
  Notification,
  NotificationEnvelope,
  NotificationListResponse,
  NotificationType,
  UnreadCountResponse,
  UpdateNotification,
} from '@rytask/contracts';
import { InboxProvider } from '../providers/inbox.provider';
import type { NotificationRow } from '../repositories/notifications.repository';

/**
 * Notifications application service — the module's public surface (Principle III).
 * Controllers and (future) MCP tools both call this — no parallel logic. Maps rows to
 * DTOs; all reads/writes are scoped to the authenticated recipient in the provider.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly inbox: InboxProvider) {}

  async list(query: ListNotificationsQuery): Promise<NotificationListResponse> {
    const { rows, hasNextPage } = await this.inbox.list(query);
    return {
      data: rows.map(toNotificationDto),
      pageInfo: { nextCursor: null, hasNextPage },
    };
  }

  async unreadCount(): Promise<UnreadCountResponse> {
    return { data: { count: await this.inbox.unreadCount() } };
  }

  async update(id: string, input: UpdateNotification): Promise<NotificationEnvelope> {
    return { data: toNotificationDto(await this.inbox.update(id, input)) };
  }
}

/** Map a notification row to its API DTO. */
function toNotificationDto(row: NotificationRow): Notification {
  return {
    id: row.id,
    recipientId: row.recipientId,
    type: row.type as NotificationType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
