import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
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
import type { MailMessage, MailerPort } from '../../../common/ports/mailer.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { MembershipsRepository } from '../../orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../orgs/repositories/workspaces.repository';
import { AccessServiceImpl } from '../../orgs/services/access.service';
import { OneTimeTokensRepository } from '../repositories/one-time-tokens.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';
import { AuthService } from '../services/auth.service';
import { TokenSigner } from '../services/token-signer.service';
import { EmailVerificationProvider } from './email-verification.provider';
import { RegisterProvider } from './register.provider';

/**
 * Integration test against REAL PostgreSQL (US2, FR-AUTH-001, D8). Proves self-registration is
 * gated by the org's `allowPublicSignup` (invite-only by default → 403), that a successful
 * signup creates a MEMBER, issues a session + a verification link, and that a duplicate email
 * → 409 with no second account.
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

describe('RegisterProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let register: RegisterProvider;
  let users: UsersRepository;
  let memberships: MembershipsRepository;
  let orgs: OrganizationsRepository;
  const sent: MailMessage[] = [];
  const mailer: MailerPort = {
    async send(message: MailMessage): Promise<void> {
      sent.push(message);
    },
  };

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    users = new UsersRepository(handle.db, tenant);
    memberships = new MembershipsRepository(handle.db, tenant);
    orgs = new OrganizationsRepository(handle.db, tenant);
    const tokenHasher = new TokenHasher(cfg);
    const hasher = new Argon2Hasher(cfg);
    const access = new AccessServiceImpl(
      memberships,
      new WorkspacesRepository(handle.db, tenant),
      orgs,
      tenant,
    );
    const auth = new AuthService(
      new TokenSigner(cfg),
      new SessionsRepository(handle.db, tenant),
      tokenHasher,
      systemClock,
      systemIdGenerator,
      cfg,
    );
    const verification = new EmailVerificationProvider(
      users,
      new OneTimeTokensRepository(handle.db, tenant),
      tokenHasher,
      mailer,
      systemClock,
      cfg,
    );
    register = new RegisterProvider(users, hasher, access, auth, new EventEmitter2(), verification);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('refuses signup while public signup is disabled (invite-only default) → 403', async () => {
    await expect(
      register.register({
        email: 'walkup@acme.test',
        name: 'Walk Up',
        password: 'a-good-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await users.findByEmail('walkup@acme.test')).toBeNull();
  });

  it('with public signup enabled → creates a MEMBER, issues a session + verification link', async () => {
    await tenant.run(ctxA, () => orgs.updateSettings({ allowPublicSignup: true }));
    sent.length = 0;

    const result = await register.register({
      email: 'newcomer@acme.test',
      name: 'New Comer',
      password: 'a-good-password',
    });
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toMatch(/^rytask_rt_/);
    expect(result.user.email).toBe('newcomer@acme.test');

    const created = await users.findByEmail('newcomer@acme.test');
    expect(created).not.toBeNull();
    if (!created) {
      throw new Error('expected the registered user to exist');
    }
    expect(await tenant.run(ctxA, () => memberships.findRole(created.id))).toBe('MEMBER');
    // A verification link was actually issued (FR-AUTH-003).
    expect(
      sent.some((m) => m.to === 'newcomer@acme.test' && m.body.includes('/verify?token=')),
    ).toBe(true);
  });

  it('refuses a duplicate email → 409 with no second account', async () => {
    await expect(
      register.register({
        email: 'founder@rytask.local',
        name: 'Imposter',
        password: 'a-good-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
