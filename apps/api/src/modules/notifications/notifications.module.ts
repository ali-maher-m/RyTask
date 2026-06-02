import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { DueScanProcessor } from './processors/due-scan.processor';
import { NotificationsDispatchProcessor } from './processors/notifications.dispatch.processor';
import { NotificationsQueue } from './processors/notifications.queue';
import { NotificationsSubscriber } from './processors/notifications.subscriber';
import { InboxProvider } from './providers/inbox.provider';
import { NotificationsRepository } from './repositories/notifications.repository';
import { NotificationsService } from './services/notifications.service';

/**
 * Notifications bounded context (data-model §4): owns `notifications`, consumes domain
 * events, dedupes (unique `dedupe_key`), and serves the inbox. Consumes the
 * `WORK_ITEM_ACCESS` port (from the @Global WorkItemsModule) for watcher fan-out at
 * enqueue time, injected by symbol — never importing work-items' module (Principle III).
 * A BullMQ dispatch processor writes exactly one row per recipient per event (D10); the
 * Worker only runs in the worker entrypoint (`WORKER=1`), so AppModule boots without a
 * live Redis in tests. Populated in US7.
 */
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsDispatchProcessor,
    DueScanProcessor,
    NotificationsQueue,
    NotificationsSubscriber,
    InboxProvider,
    NotificationsService,
  ],
})
export class NotificationsModule {}
