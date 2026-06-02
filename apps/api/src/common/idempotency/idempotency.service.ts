import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { TenantContextService } from '../tenancy/tenant-context.service';

/** Marker stored while the original request is still running (distinguishes in-flight from cached). */
const PENDING = '__pending__';
/** Replay window for a cached response (24h) — long enough to absorb client retries. */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Idempotency for mutating API calls (ARCHITECTURE invariant — "every mutating public API call
 * supports idempotency"). Keyed by (org, scope, client `Idempotency-Key`) in Redis: the first
 * request runs and caches its response; an identical retry returns the cached response instead of
 * re-executing (so a flaky client retry can't create duplicates). A concurrent in-flight duplicate
 * gets a 409. When no key is supplied the call runs normally (idempotency is opt-in per request).
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tenant: TenantContextService,
  ) {}

  async run<T>(key: string | undefined, scope: string, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn(); // no Idempotency-Key → ordinary (non-deduplicated) path
    const redisKey = `idem:${this.tenant.getOrgId()}:${scope}:${key}`;

    // Claim the key atomically (SET NX). The winner executes; everyone else replays/conflicts.
    const acquired = await this.redis.set(redisKey, PENDING, 'EX', TTL_SECONDS, 'NX');
    if (acquired === 'OK') {
      try {
        const result = await fn();
        await this.redis.set(redisKey, JSON.stringify(result), 'EX', TTL_SECONDS);
        return result;
      } catch (err) {
        // Never cache a failure — drop the marker so the client may retry the operation.
        await this.redis.del(redisKey);
        throw err;
      }
    }

    const cached = await this.redis.get(redisKey);
    if (cached && cached !== PENDING) {
      return JSON.parse(cached) as T;
    }
    // The original request is still running — a true concurrent duplicate.
    throw new ConflictException('a request with this Idempotency-Key is already in progress');
  }
}
