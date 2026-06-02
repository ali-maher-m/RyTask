import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { DueScanProcessor } from './due-scan.processor';
import {
  type NotificationJobData,
  NotificationsDispatchProcessor,
} from './notifications.dispatch.processor';

/** BullMQ queue name for notification dispatch (one job per domain event). */
export const NOTIFICATIONS_QUEUE = 'notifications.dispatch';

/** BullMQ job name for the daily due-soon/overdue scan (a repeatable job on the same queue). */
export const DUE_SCAN_JOB = 'due-scan';

/** Cron for the daily due scan (07:00 server time) — produces DUE_SOON/OVERDUE notifications. */
export const DUE_SCAN_CRON = '0 7 * * *';

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
    private readonly dueScan: DueScanProcessor,
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
        async (job) => {
          // The daily repeatable scan fans out into one dispatch job per due/overdue item.
          if (job.name === DUE_SCAN_JOB) {
            const jobs = await this.dueScan.computeJobs();
            for (const data of jobs) await this.enqueue(data);
            return jobs.length;
          }
          return this.processor.handle(job.data);
        },
        { connection: this.connectionOptions() },
      );
      // Register the daily due-soon/overdue scan. BullMQ dedupes repeatable jobs by their repeat
      // key, so re-adding on every worker boot is idempotent (no duplicate schedules).
      void this.getQueue().add(DUE_SCAN_JOB, {} as NotificationJobData, {
        repeat: { pattern: DUE_SCAN_CRON },
        removeOnComplete: true,
        removeOnFail: 100,
      });
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
