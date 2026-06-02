/**
 * Production transport-security headers (NFR-SEC-001, SC-015). In production the API is served
 * only over TLS (terminated at the proxy), so it advertises HSTS — TLS-only, including
 * subdomains — plus `X-Content-Type-Options: nosniff`. In non-production these are omitted so
 * local plain-HTTP development works.
 *
 * RyTask auth is **cookieless**: access + refresh tokens are returned in the response body and
 * presented via the `Authorization` header, never a `Set-Cookie`. There is therefore no
 * session cookie that could be non-`Secure`/non-`HttpOnly`, and no CSRF surface — the cookie
 * clause of NFR-SEC-001 is satisfied by construction.
 */

/** HSTS max-age: one year (the SC-015 baseline). */
export const HSTS_MAX_AGE_SECONDS = 31_536_000;

/** Minimal structural sink so this stays free of an Express type dependency. */
interface HeaderSink {
  setHeader(name: string, value: string): void;
}

/** Express-style middleware applying the production transport-security headers. */
export function securityHeaders(isProduction: boolean) {
  return (_req: unknown, res: HeaderSink, next: () => void): void => {
    if (isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`,
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    next();
  };
}
