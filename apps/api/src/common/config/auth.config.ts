import { registerAs } from '@nestjs/config';

/**
 * Typed auth/security configuration (research D2/D3/D8/D12). Registered via
 * `ConfigModule` under the `auth` namespace; every secret comes from the environment
 * (Principle VI — no secrets in code). Safe self-host defaults are supplied so
 * `docker compose up` works out of the box; production overrides via `.env`.
 *
 * Access tokens are stateless JWTs (verified with no DB round-trip, perf goal). The
 * default algorithm is HS256 (one shared secret — the api + worker run from the same
 * image, ADR-012); set `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (PEM) to switch to RS256 for
 * the future external-verifier/MCP milestone (D3). The access TTL is hard-capped at
 * 15 minutes (SC-003).
 */
export const ACCESS_TTL_CAP_SECONDS = 900;

export interface JwtConfig {
  algorithm: 'HS256' | 'RS256';
  /** HS256 shared secret. */
  secret: string;
  /** RS256 PEM keys (optional; presence selects RS256). */
  privateKey?: string;
  publicKey?: string;
  issuer: string;
  /** Access-token lifetime in seconds, capped at {@link ACCESS_TTL_CAP_SECONDS}. */
  accessTtlSeconds: number;
  /** Refresh-token lifetime in seconds. */
  refreshTtlSeconds: number;
}

export interface Argon2Config {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export interface ThrottleConfig {
  /** Global per-principal/IP bucket. */
  windowSeconds: number;
  maxRequests: number;
  /** Stricter bucket for `/auth/*` (D12). */
  authWindowSeconds: number;
  authMaxRequests: number;
  /** Failed-login lockout per (email, IP) (D12, SC-011). */
  loginMaxFailures: number;
  loginLockoutSeconds: number;
}

export interface AuthConfig {
  jwt: JwtConfig;
  argon2: Argon2Config;
  throttle: ThrottleConfig;
  /** Org-level default for self-registration; invite-only unless enabled (D8). */
  allowPublicSignup: boolean;
  /** Base URL used to build verification/reset/invite links in emails. */
  appBaseUrl: string;
}

const int = (value: string | undefined, fallback: number): number => {
  const n = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === 'true' || value === '1';

export const authConfig = registerAs('auth', (): AuthConfig => {
  const privateKey = process.env.JWT_PRIVATE_KEY;
  const publicKey = process.env.JWT_PUBLIC_KEY;
  const algorithm: JwtConfig['algorithm'] = privateKey && publicKey ? 'RS256' : 'HS256';
  return {
    jwt: {
      algorithm,
      secret: process.env.JWT_SECRET ?? 'dev-insecure-jwt-secret-change-me',
      privateKey,
      publicKey,
      issuer: process.env.JWT_ISSUER ?? 'rytask',
      accessTtlSeconds: Math.min(
        int(process.env.ACCESS_TOKEN_TTL_SECONDS, 900),
        ACCESS_TTL_CAP_SECONDS,
      ),
      refreshTtlSeconds: int(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 30),
    },
    argon2: {
      memoryCost: int(process.env.ARGON2_MEMORY_COST, 19_456),
      timeCost: int(process.env.ARGON2_TIME_COST, 2),
      parallelism: int(process.env.ARGON2_PARALLELISM, 1),
    },
    throttle: {
      windowSeconds: int(process.env.THROTTLE_WINDOW_SECONDS, 60),
      maxRequests: int(process.env.THROTTLE_MAX_REQUESTS, 300),
      authWindowSeconds: int(process.env.AUTH_THROTTLE_WINDOW_SECONDS, 60),
      authMaxRequests: int(process.env.AUTH_THROTTLE_MAX_REQUESTS, 20),
      loginMaxFailures: int(process.env.LOGIN_MAX_FAILURES, 5),
      loginLockoutSeconds: int(process.env.LOGIN_LOCKOUT_SECONDS, 15 * 60),
    },
    allowPublicSignup: bool(process.env.ALLOW_PUBLIC_SIGNUP, false),
    appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  };
});

/** DI-injectable namespace key (`@Inject(authConfig.KEY)`). */
export type AuthConfigType = AuthConfig;
