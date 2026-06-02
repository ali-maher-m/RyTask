import { describe, expect, it, vi } from 'vitest';
import { HSTS_MAX_AGE_SECONDS, securityHeaders } from '../config/security';

/**
 * Transport-security config test (T112, US-Polish, NFR-SEC-001, SC-015). Asserts the
 * production middleware advertises HSTS (TLS-only, ≥ 1 year, includeSubDomains) + nosniff and
 * always calls next, and that development omits HSTS so local http works. The cookie clause is
 * satisfied by construction — auth is cookieless (bearer tokens), so there is no session
 * cookie to mark Secure/HttpOnly (documented in `common/config/security.ts`).
 */
const run = (isProduction: boolean) => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
  };
  const next = vi.fn();
  securityHeaders(isProduction)({}, res, next);
  return { headers, next };
};

describe('transport security', () => {
  it('advertises HSTS + nosniff in production and continues the chain', () => {
    const { headers, next } = run(true);
    const hsts = headers['Strict-Transport-Security'];
    expect(hsts).toBeDefined();
    expect(hsts).toContain('includeSubDomains');
    const maxAge = Number(hsts?.match(/max-age=(\d+)/)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(HSTS_MAX_AGE_SECONDS);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000); // ≥ 1 year
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(next).toHaveBeenCalledOnce();
  });

  it('omits HSTS in development (local plain-HTTP) and continues the chain', () => {
    const { headers, next } = run(false);
    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
