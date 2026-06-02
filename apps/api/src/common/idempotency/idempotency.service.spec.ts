import { ConflictException } from '@nestjs/common';
import type Redis from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import type { TenantContextService } from '../tenancy/tenant-context.service';
import { IdempotencyService } from './idempotency.service';

/**
 * Unit tests for the idempotency replay store (mutating-call invariant). A minimal in-memory Redis
 * stand-in models `SET NX EX` / `GET` / `DEL` so the compare-and-set logic is exercised without a
 * live Redis.
 */
function fakeRedis() {
  const store = new Map<string, string>();
  const redis = {
    store,
    async set(key: string, val: string, _ex: string, _ttl: number, nx?: string) {
      if (nx === 'NX' && store.has(key)) return null;
      store.set(key, val);
      return 'OK';
    },
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async del(key: string) {
      return store.delete(key) ? 1 : 0;
    },
  };
  return redis;
}

const tenant = { getOrgId: () => 'org-1' } as unknown as TenantContextService;
const make = () => {
  const redis = fakeRedis();
  return { redis, svc: new IdempotencyService(redis as unknown as Redis, tenant) };
};

describe('IdempotencyService', () => {
  it('runs the operation once and replays the cached response on retry', async () => {
    const { svc } = make();
    const fn = vi.fn(async () => ({ id: 'created-1' }));
    const first = await svc.run('key-1', 'work-items.create', fn);
    const second = await svc.run('key-1', 'work-items.create', fn);
    expect(first).toEqual({ id: 'created-1' });
    expect(second).toEqual({ id: 'created-1' }); // replayed from the cache
    expect(fn).toHaveBeenCalledTimes(1); // not re-executed
  });

  it('runs every time when no Idempotency-Key is supplied', async () => {
    const { svc } = make();
    const fn = vi.fn(async () => ({ id: 'x' }));
    await svc.run(undefined, 'scope', fn);
    await svc.run(undefined, 'scope', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('409s a concurrent in-flight duplicate (marker still pending)', async () => {
    const { redis, svc } = make();
    redis.store.set('idem:org-1:scope:k', '__pending__'); // simulate the original still running
    await expect(svc.run('k', 'scope', async () => ({}))).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not cache a failure (a later retry may still succeed)', async () => {
    const { svc } = make();
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(svc.run('k2', 'scope', failing)).rejects.toThrow('boom');
    const ok = vi.fn(async () => ({ id: 'ok' }));
    expect(await svc.run('k2', 'scope', ok)).toEqual({ id: 'ok' });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
