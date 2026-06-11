import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type ConnectionOptions, Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { type GithubLinkJob, GithubLinkProcessor } from './github-link.processor';

/** BullMQ queue name for GitHub link processing (one job per accepted webhook delivery). */
export const GITHUB_LINK_QUEUE = 'github.link';

/**
 * Deterministic job id (FR-INT-GH-007 — the Slack `slackCaptureJobId` mechanism). GitHub sends a
 * unique `X-GitHub-Delivery` GUID per delivery and REUSES it on redelivery, so the id is stable
 * across a replay and BullMQ refuses the duplicate `add` — idempotency at the queue door, with the
 * `github_links` unique index as the second, in-data guard. Parts join with `-` (BullMQ rejects
 * `:` in custom ids); both parts are UUID/GUID-shaped so the id stays unambiguous.
 */
export function githubLinkJobId(job: GithubLinkJob): string {
  return `github-${job.connectionId}-${job.deliveryId}`;
}

/**
 * Owns the BullMQ `Queue` (producer, used by the webhook controller) and — only when `WORKER=1` —
 * the `Worker` (consumer). Byte-for-byte the `SlackCaptureQueue` lifecycle: the Queue is lazily
 * constructed over the shared lazy-connect ioredis client (no socket at module init, so AppModule +
 * contract tests boot with no live Redis), and the Worker starts ONLY in the worker entrypoint.
 */
@Injectable()
export class GithubLinkQueue implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue<GithubLinkJob>;
  private worker?: Worker<GithubLinkJob>;

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
    private readonly processor: GithubLinkProcessor,
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
      this.worker = new Worker<GithubLinkJob>(
        GITHUB_LINK_QUEUE,
        async (job) => this.processor.handle(job.data),
        { connection: this.connectionOptions() },
      );
    }
  }

  /** Lazily construct the producer Queue (no socket until the first enqueue). */
  private getQueue(): Queue<GithubLinkJob> {
    let queue = this.queue;
    if (!queue) {
      queue = new Queue<GithubLinkJob>(GITHUB_LINK_QUEUE, {
        connection: this.connectionOptions(),
      });
      this.queue = queue;
    }
    return queue;
  }

  /** Enqueue one link job with its deterministic, idempotent job id. */
  async enqueue(job: GithubLinkJob): Promise<void> {
    await this.getQueue().add('link', job, {
      jobId: githubLinkJobId(job),
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
