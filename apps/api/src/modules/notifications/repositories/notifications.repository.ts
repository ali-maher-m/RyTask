import { Inject, Injectable } from '@nestjs/common';
import { type Database, notifications } from '@rytask/db';
import { type SQL, and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { PlannedNotification } from '../domain/dedupe.policy';

export type NotificationRow = typeof notifications.$inferSelect;

/** Inbox state selector (matches the OpenAPI `state` enum). */
export type InboxState = 'unread' | 'all' | 'snoozed' | 'archived';

export interface NotificationUpdate {
  readAt?: Date | null;
  snoozedUntil?: Date | null;
  archivedAt?: Date | null;
}

/**
 * Tenant-scoped reads/writes for `notifications` (owned by the notifications module,
 * data-model §4). Exactly-once is structural: inserts use `onConflictDoNothing` on the
 * unique `dedupe_key` (D10, SC-010). The inbox list, unread count, and state mutations
 * always carry `recipient_id = :me` on top of the tenant scope.
 */
@Injectable()
export class NotificationsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /**
   * Insert the planned rows for one event, skipping any whose `dedupe_key` already
   * exists (the unique index is the exactly-once backstop). Returns the number of rows
   * actually written (0 on a full replay). One statement → atomic + cheap.
   */
  async insertDeduped(rows: PlannedNotification[]): Promise<number> {
    if (rows.length === 0) return 0;
    const orgId = this.tenant.getOrgId();
    const inserted = await this.db
      .insert(notifications)
      .values(
        rows.map((r) => ({
          organizationId: orgId,
          recipientId: r.recipientId,
          type: r.type,
          entityType: r.entityType,
          entityId: r.entityId,
          actorId: r.actorId,
          payload: r.payload,
          dedupeKey: r.dedupeKey,
        })),
      )
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    return inserted.length;
  }

  /** The state predicate for the inbox list (relative to `now` for snooze). */
  private statePredicate(state: InboxState, now: Date): SQL | undefined {
    switch (state) {
      case 'unread':
        // Unread, not archived, and not currently snoozed (snooze re-surfaces at its time).
        return and(
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
        ) as SQL;
      case 'snoozed':
        return and(
          isNull(notifications.archivedAt),
          isNotNull(notifications.snoozedUntil),
          gt(notifications.snoozedUntil, now),
        ) as SQL;
      case 'archived':
        return isNotNull(notifications.archivedAt);
      default:
        return undefined; // 'all'
    }
  }

  /** Inbox page for the current recipient (tenant-scoped), newest first. */
  async listForRecipient(
    recipientId: string,
    state: InboxState,
    limit: number,
    now: Date,
  ): Promise<NotificationRow[]> {
    return this.db
      .select()
      .from(notifications)
      .where(
        this.scoped(
          notifications,
          eq(notifications.recipientId, recipientId),
          this.statePredicate(state, now),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit + 1);
  }

  /**
   * Unread badge count for the recipient: unread, not archived, not currently snoozed
   * (uses the partial `(recipient_id) WHERE read_at IS NULL` index).
   */
  async unreadCount(recipientId: string, now: Date): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        this.scoped(
          notifications,
          eq(notifications.recipientId, recipientId),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
        ),
      );
    return row?.count ?? 0;
  }

  /** A single notification by id, scoped to the recipient (tenant-scoped), or null. */
  async findForRecipient(id: string, recipientId: string): Promise<NotificationRow | null> {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(
        this.scoped(
          notifications,
          eq(notifications.id, id),
          eq(notifications.recipientId, recipientId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Apply read/snooze/archive to a notification owned by the recipient. Returns the row. */
  async update(
    id: string,
    recipientId: string,
    patch: NotificationUpdate,
  ): Promise<NotificationRow | null> {
    const [row] = await this.db
      .update(notifications)
      .set(patch)
      .where(
        this.scoped(
          notifications,
          eq(notifications.id, id),
          eq(notifications.recipientId, recipientId),
        ),
      )
      .returning();
    return row ?? null;
  }
}
