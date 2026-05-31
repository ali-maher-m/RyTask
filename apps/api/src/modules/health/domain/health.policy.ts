import type { Readiness } from '@rytask/contracts';

/**
 * Pure domain rule (no I/O → unit-tested at high coverage, §14.5):
 * the service is only "ok" when every dependency is up.
 */
export function deriveReadinessStatus(checks: Readiness['checks']): Readiness['status'] {
  return checks.database === 'up' && checks.redis === 'up' ? 'ok' : 'degraded';
}
