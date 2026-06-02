import { UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_USER_PASSWORD,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import { systemIdGenerator } from '../../../common/ports/id-generator.port';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { AccessServiceImpl } from '../../orgs/services/access.service';
import { MembershipsRepository } from '../../orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../orgs/repositories/workspaces.repository';
import { AuthService } from '../services/auth.service';
import { TokenSigner } from '../services/token-signer.service';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';
import { LoginProvider } from './login.provider';
import { LogoutProvider } from './logout.provider';
import { RefreshProvider } from './refresh.provider';

/**
 * Integration test against REAL PostgreSQL (T044, US2, FR-AUTH-001/002, SC-003). Proves
 * login issues access + rotating refresh; refresh rotates + invalidates the prior token;
 * reusing a rotated token revokes the whole family; logout revokes the session. Generic 401
 * on bad credentials (no enumeration).
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

describe('Login/Refresh/Logout providers (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let login: LoginProvider;
  let refresh: RefreshProvider;
  let logout: LogoutProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    const users = new UsersRepository(handle.db, tenant);
    const sessions = new SessionsRepository(handle.db, tenant);
    const access = new AccessServiceImpl(
      new MembershipsRepository(handle.db, tenant),
      new WorkspacesRepository(handle.db, tenant),
      new OrganizationsRepository(handle.db, tenant),
      tenant,
    );
    const tokenHasher = new TokenHasher(cfg);
    const auth = new AuthService(
      new TokenSigner(cfg),
      sessions,
      tokenHasher,
      systemClock,
      systemIdGenerator,
      cfg,
    );
    login = new LoginProvider(users, new Argon2Hasher(cfg), access, auth, new EventEmitter2());
    refresh = new RefreshProvider(sessions, users, tokenHasher, access, auth, systemClock);
    logout = new LogoutProvider(sessions, tenant, systemClock);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('logs in a seeded user → access + refresh + verified user', async () => {
    const result = await login.login({ email: 'founder@rytask.local', password: SEED_USER_PASSWORD });
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toMatch(/^rytask_rt_/);
    expect(result.user.email).toBe('founder@rytask.local');
    expect(result.expiresIn).toBeLessThanOrEqual(900);
  });

  it('rejects a wrong password and an unknown email with a generic 401', async () => {
    await expect(
      login.login({ email: 'founder@rytask.local', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      login.login({ email: 'nobody@nowhere.test', password: SEED_USER_PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates the refresh token and revokes the family on reuse (SC-003)', async () => {
    const first = await login.login({
      email: 'founder@rytask.local',
      password: SEED_USER_PASSWORD,
    });
    const rotated = await refresh.refresh({ refreshToken: first.refreshToken });
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // Reusing the original (already-rotated) token is theft → revoke the whole family.
    await expect(refresh.refresh({ refreshToken: first.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The rotated token from the same family is now revoked too.
    await expect(refresh.refresh({ refreshToken: rotated.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout revokes the active sessions (refresh rejected afterwards)', async () => {
    const session = await login.login({
      email: 'founder@rytask.local',
      password: SEED_USER_PASSWORD,
    });
    await tenant.run(ctxA, () => logout.logout());
    await expect(refresh.refresh({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
