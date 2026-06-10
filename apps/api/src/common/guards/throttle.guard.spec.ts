import { type ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { authConfig } from '../config/auth.config';
import { ThrottleGuard } from './throttle.guard';

/**
 * Unit tests for the ThrottleGuard (research D12). Redis fixed-window buckets keyed by principal
 * (or IP), stricter on `/auth/*`, 429 over-limit, and — critically for self-host resilience —
 * **fail open** when Redis is unavailable. Driven with a fake Redis + stub ExecutionContext.
 */
const cfg = authConfig();

const makeContext = (
  req: { url?: string; ip?: string; principal?: { userId?: string } },
  type: 'http' | 'ws' = 'http',
): ExecutionContext =>
  ({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const fakeRedis = (count: number, opts: { throws?: boolean } = {}) => {
  const incr = vi.fn(async () => {
    if (opts.throws) {
      throw new Error('redis down');
    }
    return count;
  });
  const expire = vi.fn(async () => 1);
  return { redis: { incr, expire } as unknown as Redis, incr, expire };
};

describe('ThrottleGuard', () => {
  it('passes through non-HTTP contexts', async () => {
    const { redis } = fakeRedis(1);
    const guard = new ThrottleGuard(redis, cfg);
    expect(await guard.canActivate(makeContext({}, 'ws'))).toBe(true);
  });

  it('allows the first request in a window and sets the TTL', async () => {
    const { redis, incr, expire } = fakeRedis(1);
    const guard = new ThrottleGuard(redis, cfg);
    expect(await guard.canActivate(makeContext({ url: '/api/v1/work-items', ip: '1.2.3.4' }))).toBe(
      true,
    );
    expect(incr).toHaveBeenCalledWith('throttle:gen:1.2.3.4');
    expect(expire).toHaveBeenCalledWith('throttle:gen:1.2.3.4', cfg.throttle.windowSeconds);
  });

  it('keys an authenticated request by user id', async () => {
    const { redis, incr } = fakeRedis(1);
    const guard = new ThrottleGuard(redis, cfg);
    await guard.canActivate(
      makeContext({ url: '/api/v1/work-items', ip: '1.2.3.4', principal: { userId: 'u-9' } }),
    );
    expect(incr).toHaveBeenCalledWith('throttle:gen:u-9');
  });

  it('429s once the general limit is exceeded', async () => {
    const { redis } = fakeRedis(cfg.throttle.maxRequests + 1);
    const guard = new ThrottleGuard(redis, cfg);
    await expect(
      guard.canActivate(makeContext({ url: '/api/v1/work-items', ip: '1.2.3.4' })),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('applies the stricter /auth/* bucket and limit', async () => {
    const { redis, incr } = fakeRedis(cfg.throttle.authMaxRequests + 1);
    const guard = new ThrottleGuard(redis, cfg);
    await expect(
      guard.canActivate(makeContext({ url: '/api/v1/auth/login', ip: '9.9.9.9' })),
    ).rejects.toBeInstanceOf(HttpException);
    expect(incr).toHaveBeenCalledWith('throttle:auth:9.9.9.9');
  });

  it('fails OPEN when Redis is unavailable (a down limiter must not block traffic)', async () => {
    const { redis } = fakeRedis(0, { throws: true });
    const guard = new ThrottleGuard(redis, cfg);
    expect(await guard.canActivate(makeContext({ url: '/api/v1/work-items', ip: '1.2.3.4' }))).toBe(
      true,
    );
  });
});
