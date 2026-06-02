import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_JWT_SECRET,
  MIN_PROD_JWT_SECRET_LENGTH,
  assertProductionJwtSecret,
} from './auth.config';

/**
 * Production boot-guard for the JWT signing secret (NFR-SEC-002). A self-hoster who forgets
 * `JWT_SECRET` must crash at startup, not run with the globally-known dev key.
 */
describe('assertProductionJwtSecret', () => {
  const strong = 'x'.repeat(MIN_PROD_JWT_SECRET_LENGTH);

  it('does nothing outside production (zero-config dev/self-host)', () => {
    expect(() => assertProductionJwtSecret({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertProductionJwtSecret({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => assertProductionJwtSecret({})).not.toThrow();
  });

  it('throws in production when the secret is missing', () => {
    expect(() => assertProductionJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('throws in production when the secret is the insecure default', () => {
    expect(() =>
      assertProductionJwtSecret({ NODE_ENV: 'production', JWT_SECRET: DEFAULT_DEV_JWT_SECRET }),
    ).toThrow(/insecure default/);
  });

  it('throws in production when the secret is too short', () => {
    expect(() =>
      assertProductionJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'too-short' }),
    ).toThrow(new RegExp(String(MIN_PROD_JWT_SECRET_LENGTH)));
  });

  it('accepts a strong HS256 secret in production', () => {
    expect(() =>
      assertProductionJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong }),
    ).not.toThrow();
  });

  it('exempts an RS256 key-pair deployment (no shared secret needed)', () => {
    expect(() =>
      assertProductionJwtSecret({
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----',
        JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----',
      }),
    ).not.toThrow();
  });
});
