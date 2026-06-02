import { HttpException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { type DbHandle, SEED_USER_PASSWORD, createDb, runMigrations, seed } from '@rytask/db';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import { systemIdGenerator } from '../../../common/ports/id-generator.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { type StartedRedis, startRedis } from '../../../common/testing/redis';
import { MembershipsRepository } from '../../orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../orgs/repositories/workspaces.repository';
import { AccessServiceImpl } from '../../orgs/services/access.service';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';
import { AuthService } from '../services/auth.service';
import { BruteForceService } from '../services/brute-force.service';
import { TokenSigner } from '../services/token-signer.service';
import { LoginProvider } from './login.provider';

/**
 * Integration test against REAL Postgres + REAL Redis (T047, US2, SC-011). Proves the failed-login
 * lockout: after `loginMaxFailures` failures from one `(email, IP)`, further attempts are refused
 * with a 429 even when the password is now correct. The lockout is per-pair (a different IP is not
 * affected), a successful sign-in resets the counter, and an unknown email locks identically to a
 * known one (no account enumeration). A low threshold is injected so the test stays fast.
 */
const FOUNDER = 'founder@rytask.local';
const THRESHOLD = 3;

describe('Failed-login lockout (integration, real Postgres + Redis)', () => {
  let pg: StartedPostgres;
  let rd: StartedRedis;
  let handle: DbHandle;
  let redis: Redis;
  let login: LoginProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    rd = await startRedis();
    redis = new Redis(rd.url, { maxRetriesPerRequest: 1 });

    const base = authConfig();
    const cfg: AuthConfigType = {
      ...base,
      throttle: { ...base.throttle, loginMaxFailures: THRESHOLD, loginLockoutSeconds: 60 },
    };

    const tenant = new TenantContextService();
    const users = new UsersRepository(handle.db, tenant);
    const sessions = new SessionsRepository(handle.db, tenant);
    const access = new AccessServiceImpl(
      new MembershipsRepository(handle.db, tenant),
      new WorkspacesRepository(handle.db, tenant),
      new OrganizationsRepository(handle.db, tenant),
      tenant,
    );
    const auth = new AuthService(
      new TokenSigner(cfg),
      sessions,
      new TokenHasher(cfg),
      systemClock,
      systemIdGenerator,
      cfg,
    );
    const bruteForce = new BruteForceService(redis, cfg);
    login = new LoginProvider(
      users,
      new Argon2Hasher(cfg),
      access,
      auth,
      bruteForce,
      new EventEmitter2(),
    );
  }, 120_000);

  afterAll(async () => {
    redis?.disconnect();
    await handle?.pool.end();
    await pg?.stop();
    await rd?.stop();
  });

  const expectLocked = async (promise: Promise<unknown>): Promise<void> => {
    let caught: unknown;
    try {
      await promise;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(429);
  };

  it('locks the (email, IP) after the failure threshold, even with the correct password (SC-011)', async () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < THRESHOLD; i += 1) {
      await expect(
        login.login({ email: FOUNDER, password: 'wrong-password' }, { ip }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // Threshold reached → even the *correct* password is now refused with a 429 lockout.
    await expectLocked(login.login({ email: FOUNDER, password: SEED_USER_PASSWORD }, { ip }));
  });

  it('does not lock a different IP for the same account', async () => {
    const lockedIp = '10.0.0.2';
    for (let i = 0; i < THRESHOLD; i += 1) {
      await expect(
        login.login({ email: FOUNDER, password: 'wrong-password' }, { ip: lockedIp }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expectLocked(
      login.login({ email: FOUNDER, password: SEED_USER_PASSWORD }, { ip: lockedIp }),
    );

    // A fresh IP for the same account is unaffected and signs in normally.
    const ok = await login.login(
      { email: FOUNDER, password: SEED_USER_PASSWORD },
      { ip: '10.0.0.99' },
    );
    expect(ok.accessToken).toBeTypeOf('string');
  });

  it('resets the counter after a successful sign-in', async () => {
    const ip = '10.0.0.3';
    // Two failures (below the threshold of three).
    for (let i = 0; i < THRESHOLD - 1; i += 1) {
      await expect(
        login.login({ email: FOUNDER, password: 'wrong-password' }, { ip }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // A correct sign-in succeeds and clears the counter…
    await login.login({ email: FOUNDER, password: SEED_USER_PASSWORD }, { ip });
    // …so two further failures still do not reach the threshold (no carry-over → not locked).
    for (let i = 0; i < THRESHOLD - 1; i += 1) {
      await expect(
        login.login({ email: FOUNDER, password: 'wrong-password' }, { ip }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    const ok = await login.login({ email: FOUNDER, password: SEED_USER_PASSWORD }, { ip });
    expect(ok.accessToken).toBeTypeOf('string');
  });

  it('locks an unknown email identically to a known one (no enumeration)', async () => {
    const ip = '10.0.0.4';
    const unknown = 'nobody@nowhere.test';
    for (let i = 0; i < THRESHOLD; i += 1) {
      await expect(
        login.login({ email: unknown, password: 'whatever' }, { ip }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    // Same 429 lockout as a real account would produce — the response reveals no existence signal.
    await expectLocked(login.login({ email: unknown, password: 'whatever' }, { ip }));
  });
});
