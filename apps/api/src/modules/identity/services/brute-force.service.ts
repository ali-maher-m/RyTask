import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * Failed-login lockout per `(email, IP)` (research D12, SC-011). The `ThrottleGuard` enforces
 * the coarse per-principal/IP rate limit but cannot see whether a credential *succeeded*, so the
 * per-account lockout lives here, beside the `LoginProvider` that observes the outcome.
 *
 * Backed by a Redis fixed-window counter and **fails open** when Redis is unavailable — a down
 * rate-limiter must never lock everyone out (mirrors `ThrottleGuard`'s self-host resilience and
 * keeps Redis-free integration tests green). Keying on `(email, IP)` — not email alone — stops one
 * attacker from globally locking out a victim, and the counter/threshold are identical for unknown
 * and known emails, so a lockout leaks nothing about account existence (no enumeration, SC-002).
 */
@Injectable()
export class BruteForceService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
  ) {}

  private key(email: string, ip: string | null | undefined): string {
    return `login:fail:${email.trim().toLowerCase()}:${ip ?? 'noip'}`;
  }

  /** Throw 429 if the `(email, IP)` pair has reached the failure threshold. Fail open on Redis error. */
  async assertNotLocked(email: string, ip: string | null | undefined): Promise<void> {
    try {
      const raw = await this.redis.get(this.key(email, ip));
      const failures = raw ? Number.parseInt(raw, 10) : 0;
      if (failures >= this.config.throttle.loginMaxFailures) {
        throw new HttpException(
          'Too many failed attempts. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Redis unavailable → fail open (never block all logins on a down rate-limiter).
    }
  }

  /** Record one failed attempt; the lockout window starts on the first failure. Fail open. */
  async recordFailure(email: string, ip: string | null | undefined): Promise<void> {
    try {
      const key = this.key(email, ip);
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, this.config.throttle.loginLockoutSeconds);
      }
    } catch {
      // Redis unavailable → fail open.
    }
  }

  /** Clear the counter after a successful sign-in. Fail open. */
  async reset(email: string, ip: string | null | undefined): Promise<void> {
    try {
      await this.redis.del(this.key(email, ip));
    } catch {
      // Redis unavailable → fail open.
    }
  }
}
