import { GoneException } from '@nestjs/common';
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
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import { systemIdGenerator } from '../../../common/ports/id-generator.port';
import { noopMailer } from '../../../common/ports/mailer.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { SessionsRepository } from '../../identity/repositories/sessions.repository';
import { UsersRepository } from '../../identity/repositories/users.repository';
import { AuthService } from '../../identity/services/auth.service';
import { TokenSigner } from '../../identity/services/token-signer.service';
import { UserProvisioningServiceImpl } from '../../identity/services/user-provisioning.service';
import { InvitationsRepository } from '../repositories/invitations.repository';
import { MembershipsRepository } from '../repositories/memberships.repository';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { AccessServiceImpl } from '../services/access.service';
import { AcceptInviteProvider } from './accept-invite.provider';
import { InviteProvider } from './invite.provider';

/**
 * Integration test against REAL PostgreSQL (T061, US3, FR-AUTH-011, SC-004). Proves an email
 * invite is accepted by a brand-new account and a link invite by a signed-in user — each
 * landing at the pre-assigned role — and that expired/used/revoked invites are refused (410)
 * with no membership/account side-effect. Idempotent for an already-active member (AC4).
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const founder: Principal = { userId: SEED_USER_ID, organizationId: SEED_ORG_ID };

const tokenFromUrl = (url: string): string => {
  const token = url.split('/invite/')[1];
  if (!token) {
    throw new Error(`no token in accept URL: ${url}`);
  }
  return token;
};

describe('Invite/AcceptInvite providers (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let invite: InviteProvider;
  let accept: AcceptInviteProvider;
  let users: UsersRepository;
  let memberships: MembershipsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    const tokenHasher = new TokenHasher(cfg);
    const hasher = new Argon2Hasher(cfg);
    const invitesRepo = new InvitationsRepository(handle.db, tenant);
    const orgsRepo = new OrganizationsRepository(handle.db, tenant);
    users = new UsersRepository(handle.db, tenant);
    memberships = new MembershipsRepository(handle.db, tenant);
    const workspaces = new WorkspacesRepository(handle.db, tenant);
    const access = new AccessServiceImpl(memberships, workspaces, orgsRepo, tenant);
    const provisioning = new UserProvisioningServiceImpl(users, hasher, systemClock);
    const auth = new AuthService(
      new TokenSigner(cfg),
      new SessionsRepository(handle.db, tenant),
      tokenHasher,
      systemClock,
      systemIdGenerator,
      cfg,
    );
    invite = new InviteProvider(
      invitesRepo,
      orgsRepo,
      tokenHasher,
      noopMailer,
      systemClock,
      cfg,
      new EventEmitter2(),
    );
    accept = new AcceptInviteProvider(
      invitesRepo,
      access,
      provisioning,
      auth,
      tokenHasher,
      systemClock,
      new EventEmitter2(),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('email invite → brand-new account accepts → membership at the pre-assigned role', async () => {
    const created = await tenant.run(ctxA, () =>
      invite.create(founder, { email: 'Newbie@Acme.test', role: 'MEMBER', expiresInHours: 168 }),
    );
    expect(created.acceptUrl).toContain('/invite/');
    expect(created.email).toBe('newbie@acme.test'); // normalized

    const result = await accept.accept(tokenFromUrl(created.acceptUrl), {
      name: 'New Bie',
      password: 'a-good-password',
    });
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toMatch(/^rytask_rt_/);
    expect(result.user.email).toBe('newbie@acme.test');
    expect(result.user.emailVerified).toBe(true);

    const newUser = await users.findByEmail('newbie@acme.test');
    expect(newUser).not.toBeNull();
    if (!newUser) {
      throw new Error('expected the invited user to exist');
    }
    expect(await tenant.run(ctxA, () => memberships.findRole(newUser.id))).toBe('MEMBER');
  });

  it('refuses re-accepting a used invite (410, single-use)', async () => {
    const created = await tenant.run(ctxA, () =>
      invite.create(founder, { email: 'once@acme.test', role: 'MEMBER', expiresInHours: 168 }),
    );
    const token = tokenFromUrl(created.acceptUrl);
    await accept.accept(token, { name: 'Once', password: 'a-good-password' });
    await expect(
      accept.accept(token, { name: 'Once', password: 'a-good-password' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('link invite → signed-in user accepts → membership at role; idempotent re-accept keeps role', async () => {
    // A user with an account but no membership yet (e.g. invited earlier under a different org).
    const provisioning = new UserProvisioningServiceImpl(
      users,
      new Argon2Hasher(authConfig()),
      systemClock,
    );
    const existing = await provisioning.createVerifiedUser({
      organizationId: SEED_ORG_ID,
      email: 'existing@acme.test',
      name: 'Exi Sting',
      password: 'pw-12345678',
    });

    const link = await tenant.run(ctxA, () =>
      invite.create(founder, { role: 'ADMIN', expiresInHours: 168 }),
    );
    expect(link.email).toBeNull(); // shareable link, no address

    const principal: Principal = { userId: existing.id, organizationId: SEED_ORG_ID };
    const res = await accept.accept(tokenFromUrl(link.acceptUrl), {}, principal);
    expect(res.user.id).toBe(existing.id);
    expect(await tenant.run(ctxA, () => memberships.findRole(existing.id))).toBe('ADMIN');

    // Re-accepting another (lower) role does not downgrade or duplicate the membership (AC4).
    const link2 = await tenant.run(ctxA, () =>
      invite.create(founder, { role: 'VIEWER', expiresInHours: 168 }),
    );
    await accept.accept(tokenFromUrl(link2.acceptUrl), {}, principal);
    expect(await tenant.run(ctxA, () => memberships.findRole(existing.id))).toBe('ADMIN');
    const mine = (await tenant.run(ctxA, () => memberships.list())).filter(
      (m) => m.userId === existing.id,
    );
    expect(mine).toHaveLength(1);
  });

  it('an anonymous accept of a link invite is refused (no address to bind)', async () => {
    const link = await tenant.run(ctxA, () =>
      invite.create(founder, { role: 'MEMBER', expiresInHours: 168 }),
    );
    await expect(
      accept.accept(tokenFromUrl(link.acceptUrl), { name: 'X', password: 'pw-12345678' }),
    ).rejects.toThrow();
  });

  it('refuses an expired invite (410) with no account created', async () => {
    const invitesRepo = new InvitationsRepository(handle.db, tenant);
    await invitesRepo.create({
      organizationId: SEED_ORG_ID,
      email: 'late@acme.test',
      role: 'MEMBER',
      tokenHash: new TokenHasher(authConfig()).hash('rytask_inv_expired-raw-token'),
      invitedByUserId: SEED_USER_ID,
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(
      accept.accept('rytask_inv_expired-raw-token', { name: 'Late', password: 'pw-12345678' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(await users.findByEmail('late@acme.test')).toBeNull();
  });

  it('refuses a revoked invite (410)', async () => {
    const created = await tenant.run(ctxA, () =>
      invite.create(founder, { email: 'revoke@acme.test', role: 'MEMBER', expiresInHours: 168 }),
    );
    await tenant.run(ctxA, () => invite.revoke(created.id));
    await expect(
      accept.accept(tokenFromUrl(created.acceptUrl), { name: 'Rev', password: 'pw-12345678' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(await users.findByEmail('revoke@acme.test')).toBeNull();
  });
});
