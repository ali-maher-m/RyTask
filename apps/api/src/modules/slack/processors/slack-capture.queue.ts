import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { type SlackCaptureJob, SlackCaptureProcessor } from './slack-capture.processor';

/** BullMQ queue name for Slack capture (one job per slash command / modal submit). */
export const SLACK_CAPTURE_QUEUE = 'slack.capture';

/**
 * Deterministic job id (research D7, slack-capture-flow §2). BullMQ refuses a duplicate `add` with
 * the same `jobId`, so a Slack RETRY (or a double-click) creates no second item — idempotency is the
 * id, with NO dedupe table. The `trigger_id` is unique per invocation, so distinct captures never
 * collide while a replay of the same delivery does.
 *
 * Parts are joined with `-` (not `:`): BullMQ reserves the colon as its Redis key separator and
 * REJECTS a custom job id that contains one. The Slack `team_id` (uppercase alphanumeric), the
 * `kind` (`slash`/`modal`), and the `trigger_id` (digits + dots) contain no `-`, so the join stays
 * unambiguous and the id stays stable across a replay.
 */
export function slackCaptureJobId(job: SlackCaptureJob): string {
  const kind = job.kind === 'slash' ? 'slash' : 'modal';
  return `slack-${job.teamId}-${kind}-${job.triggerId}`;
}

/**
 * Owns the BullMQ `Queue` (producer, used by the webhook controller to enqueue within Slack's 3 s
 * window) and — only when `WORKER=1` — the `Worker` (consumer) for Slack capture. Mirrors
 * `NotificationsQueue`: the Queue is lazily constructed over the shared lazy-connect ioredis client
 * (no socket at module init, so AppModule + contract tests boot with no live Redis), and the Worker
 * is started ONLY in the worker entrypoint — never in the API/test process.
 *
 * The job HANDLER is `SlackCaptureProcessor.handle`, a plain callable, so the processor test can
 * invoke it directly AND via a real enqueue→Worker round-trip (FR-SLK-014).
 */
@Injectable()
export class SlackCaptureQueue implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<SlackCaptureJob>;
  private worker?: Worker<SlackCaptureJob>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly processor: SlackCaptureProcessor,
  ) {}

  /** Fresh connection spec from the shared client's config (`maxRetriesPerRequest: null` for BullMQ). */
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
    if (process.env.WORKER === '1') {
      this.worker = new Worker<SlackCaptureJob>(
        SLACK_CAPTURE_QUEUE,
        async (job) => this.processor.handle(job.data),
        { connection: this.connectionOptions() },
      );
    }
  }

  /** Lazily construct the producer Queue (no socket until the first enqueue). */
  private getQueue(): Queue<SlackCaptureJob> {
    let queue = this.queue;
    if (!queue) {
      queue = new Queue<SlackCaptureJob>(SLACK_CAPTURE_QUEUE, {
        connection: this.connectionOptions(),
      });
      this.queue = queue;
    }
    return queue;
  }

  /** Enqueue one capture job with its deterministic, idempotent job id (the only hot-path work). */
  async enqueue(job: SlackCaptureJob): Promise<void> {
    await this.getQueue().add('capture', job, {
      jobId: slackCaptureJobId(job),
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
