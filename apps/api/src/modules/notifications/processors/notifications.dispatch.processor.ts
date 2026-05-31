import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type NotificationEvent, planNotifications } from '../domain/dedupe.policy';
import { NotificationsRepository } from '../repositories/notifications.repository';

/**
 * The serialized job a notification-dispatch event carries. Recipients are resolved at
 * enqueue time (the subscriber has request context to fan out over watchers), so the
 * worker side stays a pure write: plan rows → insert deduped. The org id travels in the
 * job because the worker runs outside any request (no ALS); the handler re-establishes
 * tenant context via `tenant.run` before touching the repository.
 */
export interface NotificationJobData {
  organizationId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  actorId: string | null;
  recipientIds: string[];
  /** Optional grouping token (else the entityId) — time-windowed events pass a date bucket. */
  bucket?: string;
  /** Inbox-render snapshot (title/key). */
  payload?: Record<string, unknown>;
}

/**
 * Notification dispatch (US7, FR-NOTIF-001/002, D10). The HANDLER is a plain callable
 * (`handle`) so it can be invoked directly in tests AND via a real BullMQ
 * enqueue→Worker round-trip. It produces EXACTLY ONE inbox row per recipient per event
 * (self-action suppressed; unique `dedupe_key`) and is idempotent on replay — re-running
 * the same job inserts nothing new (onConflictDoNothing on `dedupe_key`).
 */
@Injectable()
export class NotificationsDispatchProcessor {
  private readonly logger = new Logger(NotificationsDispatchProcessor.name);

  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly tenant: TenantContextService,
  ) {}

  /** Process one dispatch job. Returns how many rows were newly inserted (0 on replay). */
  async handle(data: NotificationJobData): Promise<number> {
    const event: NotificationEvent = {
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      actorId: data.actorId,
      recipientIds: data.recipientIds,
      bucket: data.bucket,
      payload: data.payload,
    };
    const planned = planNotifications(event);
    if (planned.length === 0) return 0;

    // The worker has no request ALS — re-establish the tenant scope from the job.
    const written = await this.tenant.run({ organizationId: data.organizationId }, () =>
      this.notifications.insertDeduped(planned),
    );
    if (written > 0) {
      this.logger.debug(
        `dispatched ${written} ${data.type} notification(s) for ${data.entityType}:${data.entityId}`,
      );
    }
    return written;
  }
}
