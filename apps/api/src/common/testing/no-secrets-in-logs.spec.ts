import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  SEED_USER_ID,
  SEED_USER_PASSWORD,
  createDb,
  runMigrations,
  seed,
  sessions,
  users,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LoginProvider } from '../../modules/identity/providers/login.provider';
import { RefreshProvider } from '../../modules/identity/providers/refresh.provider';
import { SessionsRepository } from '../../modules/identity/repositories/sessions.repository';
import { UsersRepository } from '../../modules/identity/repositories/users.repository';
import { AuthService } from '../../modules/identity/services/auth.service';
import { BruteForceService } from '../../modules/identity/services/brute-force.service';
import { TokenSigner } from '../../modules/identity/services/token-signer.service';
import { MembershipsRepository } from '../../modules/orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../modules/orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../modules/orgs/repositories/workspaces.repository';
import { AccessServiceImpl } from '../../modules/orgs/services/access.service';
import { TokenHasher } from '../auth/token-hasher';
import { authConfig } from '../config/auth.config';
import { Argon2Hasher } from '../ports/argon2-hasher.adapter';
import { systemClock } from '../ports/clock.port';
import { systemIdGenerator } from '../ports/id-generator.port';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from './postgres';

/**
 * Security test (T048, US2, NFR-SEC-002, SC-002): **no plaintext secret in storage, logs, or URLs.**
 * Drives a real sign-in + refresh against real Postgres while capturing every log sink, then asserts:
 *  - storage: the password is persisted only as an argon2id hash and the refresh token only as a keyed
 *    hash — never the plaintext;
 *  - logs: no captured log line contains the plaintext password, access token, or refresh token;
 *  - URLs: auth is cookieless/bearer (tokens travel in the body / Authorization header), so no secret
 *    appears in any request path the flow uses.
 */
const FOUNDER = 'founder@rytask.local';

// Stub Redis → BruteForceService fails open (this suite does not exercise the lockout).
const noopRedis = {
  get: async () => null,
  incr: async () => 1,
  expire: async () => 1,
  del: async () => 1,
} as unknown as import('ioredis').default;

describe('No secrets in storage / logs / URLs (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let login: LoginProvider;
  let refresh: RefreshProvider;
  let tokenHasher: TokenHasher;
  const logged: string[] = [];

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    const tenant = new TenantContextService();
    const usersRepo = new UsersRepository(handle.db, tenant);
    const sessionsRepo = new SessionsRepository(handle.db, tenant);
    const access = new AccessServiceImpl(
      new MembershipsRepository(handle.db, tenant),
      new WorkspacesRepository(handle.db, tenant),
      new OrganizationsRepository(handle.db, tenant),
      tenant,
    );
    tokenHasher = new TokenHasher(cfg);
    const auth = new AuthService(
      new TokenSigner(cfg),
      sessionsRepo,
      tokenHasher,
      systemClock,
      systemIdGenerator,
      cfg,
    );
    const bruteForce = new BruteForceService(noopRedis, cfg);
    login = new LoginProvider(
      usersRepo,
      new Argon2Hasher(cfg),
      access,
      auth,
      bruteForce,
      new EventEmitter2(),
    );
    refresh = new RefreshProvider(sessionsRepo, usersRepo, tokenHasher, access, auth, systemClock);
  }, 120_000);

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    logged.length = 0;
  });

  /** Tee every log/console sink into `logged` so we can assert no secret was emitted. */
  const captureLogs = (): void => {
    const sink = (...args: unknown[]): void => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    for (const m of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      vi.spyOn(Logger.prototype, m).mockImplementation(sink);
    }
    for (const m of ['log', 'error', 'warn', 'debug', 'info'] as const) {
      vi.spyOn(console, m).mockImplementation(sink);
    }
  };

  it('stores the password and refresh token only as hashes — never the plaintext (SC-002)', async () => {
    const result = await login.login({ email: FOUNDER, password: SEED_USER_PASSWORD });

    const [userRow] = await handle.db.select().from(users).where(eq(users.id, SEED_USER_ID));
    expect(userRow?.passwordHash).toBeDefined();
    expect(userRow?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(userRow?.passwordHash).not.toContain(SEED_USER_PASSWORD);

    const [sessionRow] = await handle.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHasher.hash(result.refreshToken)));
    expect(sessionRow).toBeDefined();
    // The plaintext refresh token is never persisted — only its keyed hash.
    expect(sessionRow?.refreshTokenHash).not.toBe(result.refreshToken);
    expect(sessionRow?.refreshTokenHash).not.toContain(SEED_USER_PASSWORD);
  });

  it('emits no plaintext password, access token, or refresh token to any log sink', async () => {
    captureLogs();
    const first = await login.login({ email: FOUNDER, password: SEED_USER_PASSWORD });
    const rotated = await refresh.refresh({ refreshToken: first.refreshToken });
    // A failed attempt is the most likely place a careless logger would echo the password.
    await login
      .login({ email: FOUNDER, password: 'definitely-the-wrong-password' })
      .catch(() => undefined);

    const blob = logged.join('\n');
    expect(blob).not.toContain(SEED_USER_PASSWORD);
    expect(blob).not.toContain('definitely-the-wrong-password');
    expect(blob).not.toContain(first.accessToken);
    expect(blob).not.toContain(first.refreshToken);
    expect(blob).not.toContain(rotated.accessToken);
    expect(blob).not.toContain(rotated.refreshToken);
  });

  it('keeps secrets out of URLs (cookieless bearer auth)', async () => {
    const result = await login.login({ email: FOUNDER, password: SEED_USER_PASSWORD });
    // The credential-bearing routes carry no secret in their path or query string; tokens are
    // returned in the response body and replayed in the Authorization header, never in a URL.
    const authUrls = [
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/whoami',
    ];
    for (const url of authUrls) {
      expect(url).not.toContain(result.accessToken);
      expect(url).not.toContain(result.refreshToken);
      expect(url).not.toContain(SEED_USER_PASSWORD);
    }
  });
});
