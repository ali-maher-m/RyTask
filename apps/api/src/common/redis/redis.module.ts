import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { RedisPort } from '../ports/redis.port';

/** DI token for the high-level RedisPort. */
export const REDIS = Symbol('REDIS');
/** DI token for the raw ioredis client (queues/pub-sub land here in M0+). */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

class IoRedisAdapter implements RedisPort {
  constructor(private readonly client: Redis) {}

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Owns the Redis client. `lazyConnect` means no socket is opened until the first
 * command, so bootstrapping without a live Redis is fine.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        // Under Vitest (NODE_ENV==='test') the contract suite runs with NO Redis. A client that keeps
        // retrying a refused connection floods the event loop with background reconnect attempts, and
        // that per-request churn is enough to perturb supertest's request/response handling into an
        // intermittent failure. In test we therefore give up reconnecting after the first failure
        // (retryStrategy → null): one connect attempt, then every command rejects instantly (offline
        // queue disabled) and the guards fail open — deterministically, with zero ongoing churn. In
        // production we keep reconnecting with a capped backoff so a Redis blip self-heals.
        const isTest = process.env.NODE_ENV === 'test';
        const client = new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: (times) => (isTest ? null : Math.min(times * 200, 5000)),
        });
        // Absorb connection-level errors. ioredis is an EventEmitter, and an `error` event with no
        // listener is promoted by Node to an *uncaught exception* — so a Redis that is down or resets
        // the socket (ECONNREFUSED/ECONNRESET) would crash the process. Command failures are already
        // handled at each call site (ThrottleGuard and IdempotencyService fail open on a rejected
        // command), so the connection `error` itself is non-fatal: swallow it here.
        client.on('error', () => {
          /* connection error — non-fatal; command-level failures are handled per call site */
        });
        return client;
      },
    },
    {
      provide: REDIS,
      useFactory: (client: Redis): RedisPort => new IoRedisAdapter(client),
      inject: [REDIS_CLIENT],
    },
  ],
  exports: [REDIS, REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
