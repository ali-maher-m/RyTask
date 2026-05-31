import { describe, expect, it } from 'vitest';
import { deriveReadinessStatus } from './health.policy';

describe('deriveReadinessStatus', () => {
  it('is "ok" only when every dependency is up', () => {
    expect(deriveReadinessStatus({ database: 'up', redis: 'up' })).toBe('ok');
  });

  it('is "degraded" when any dependency is down', () => {
    expect(deriveReadinessStatus({ database: 'down', redis: 'up' })).toBe('degraded');
    expect(deriveReadinessStatus({ database: 'up', redis: 'down' })).toBe('degraded');
    expect(deriveReadinessStatus({ database: 'down', redis: 'down' })).toBe('degraded');
  });
});
