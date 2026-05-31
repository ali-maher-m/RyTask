import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ListNotificationsQuery, UpdateNotification } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import {
  type InboxState,
  type NotificationRow,
  type NotificationUpdate,
  NotificationsRepository,
} from '../repositories/notifications.repository';

export interface InboxPage {
  rows: NotificationRow[];
  hasNextPage: boolean;
}

/**
 * Inbox read/state provider (US7, FR-NOTIF-002). All operations are scoped to the
 * authenticated recipient (a user may only see/mutate their own notifications — RBAC
 * `authenticated`). Snooze re-surfaces after `snoozed_until`; archive hides.
 */
@Injectable()
export class InboxProvider {
  constructor(
    private readonly notifications: NotificationsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenant: TenantContextService,
  ) {}

  private recipientId(): string {
    const userId = this.tenant.getUserId();
    if (!userId) {
      throw new UnauthorizedException('No authenticated principal');
    }
    return userId;
  }

  /** Inbox page for the current recipient (keyset-shaped; M1 is single-page per state). */
  async list(query: ListNotificationsQuery): Promise<InboxPage> {
    const recipientId = this.recipientId();
    const rows = await this.notifications.listForRecipient(
      recipientId,
      query.state as InboxState,
      query.limit,
      this.clock.now(),
    );
    const hasNextPage = rows.length > query.limit;
    return { rows: hasNextPage ? rows.slice(0, query.limit) : rows, hasNextPage };
  }

  /** Unread badge count for the current recipient. */
  async unreadCount(): Promise<number> {
    return this.notifications.unreadCount(this.recipientId(), this.clock.now());
  }

  /** Apply read/snooze/archive to one of the current recipient's notifications. */
  async update(id: string, input: UpdateNotification): Promise<NotificationRow> {
    const recipientId = this.recipientId();
    const patch: NotificationUpdate = {};
    if ('read' in input && input.read !== undefined) {
      patch.readAt = input.read ? this.clock.now() : null;
    }
    if ('snoozedUntil' in input) {
      patch.snoozedUntil = input.snoozedUntil ? new Date(input.snoozedUntil) : null;
    }
    if ('archived' in input && input.archived !== undefined) {
      patch.archivedAt = input.archived ? this.clock.now() : null;
    }
    const row = await this.notifications.update(id, recipientId, patch);
    if (!row) {
      throw new NotFoundException(`notification ${id} not found`);
    }
    return row;
  }
}
