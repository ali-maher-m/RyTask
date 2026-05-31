import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import {
  type NotificationJobData,
  NotificationsDispatchProcessor,
} from './notifications.dispatch.processor';

/** BullMQ queue name for notification dispatch (one job per domain event). */
export const NOTIFICATIONS_QUEUE = 'notifications.dispatch';

/**
 * Owns the BullMQ `Queue` (producer) and — only when `WORKER=1` — the `Worker`
 * (consumer) for notification dispatch. The Queue is constructed lazily over the shared
 * lazyConnect ioredis client (no socket at module init), so AppModule boots without a
 * live Redis: the 155 contract/unit tests bring up AppModule and never enqueue. The
 * Worker is started only in the worker entrypoint (`WORKER=1`) — never in the API/test
 * process — so it never opens a socket or pulls jobs during contract tests.
 *
 * The job HANDLER is `NotificationsDispatchProcessor.handle`, a plain callable, so the
 * processor test can invoke it directly AND drive it via a real enqueue→Worker round-trip.
 */
@Injectable()
export class NotificationsQueue implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<NotificationJobData>;
  private worker?: Worker<NotificationJobData>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly processor: NotificationsDispatchProcessor,
  ) {}

  /**
   * BullMQ connection options derived from the shared RedisModule client's config (same
   * host/port/auth/db the rest of the app uses — the REDIS_CLIENT seam) but as a fresh
   * connection spec, so neither the Queue nor the blocking Worker monopolize the shared
   * socket. `maxRetriesPerRequest: null` is required by BullMQ's blocking commands.
   */
  private connectionOptions(): ConnectionOptions {
    const o = this.client.options;
    return {
      host: o.host,
      port: o.port,
      username: o.username,
      password: o.password,
      db: o.db,
      maxRetriesPerRequest: null,
    } as ConnectionOptions;
  }

  onModuleInit(): void {
    // Only the dedicated worker process consumes jobs. The API process is a pure
    // producer; tests never set WORKER=1, so no Worker socket is opened there.
    if (process.env.WORKER === '1') {
      this.worker = new Worker<NotificationJobData>(
        NOTIFICATIONS_QUEUE,
        async (job) => this.processor.handle(job.data),
        { connection: this.connectionOptions() },
      );
    }
  }

  /** Lazily construct the producer Queue (no socket until the first enqueue). */
  private getQueue(): Queue<NotificationJobData> {
    let queue = this.queue;
    if (!queue) {
      queue = new Queue<NotificationJobData>(NOTIFICATIONS_QUEUE, {
        connection: this.connectionOptions(),
      });
      this.queue = queue;
    }
    return queue;
  }

  /** Enqueue one notification-dispatch job (called from the event subscriber). */
  async enqueue(data: NotificationJobData): Promise<void> {
    await this.getQueue().add('dispatch', data, {
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
