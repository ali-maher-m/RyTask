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
      useFactory: (): Redis =>
        new Redis(process.env.REDIS_URL ?? DEFAULT_REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        }),
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
