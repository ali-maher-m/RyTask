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
import type { Principal } from '../../../common/auth/principal';
import { authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ApiTokensRepository } from '../../identity/repositories/api-tokens.repository';
import { SessionsRepository } from '../../identity/repositories/sessions.repository';
import { UsersRepository } from '../../identity/repositories/users.repository';
import { IdentityAccessServiceImpl } from '../../identity/services/identity-access.service';
import { UserProvisioningServiceImpl } from '../../identity/services/user-provisioning.service';
import { MembershipsRepository } from '../repositories/memberships.repository';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { MemberAdminProvider } from './member-admin.provider';

/**
 * Integration test against REAL PostgreSQL (T102, US8, FR-RBAC-003, SC-007/SC-015). Proves
 * set-role, the last-owner guard (409), atomic + attributable ownership transfer, the
 * Admin-cannot-touch-Owner rule (403), and that member removal revokes the user's sessions +
 * tokens. Stateful, ordered scenario over a seeded org (founder OWNER) + a second member.
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const founderOwner: Principal = {
  userId: SEED_USER_ID,
  organizationId: SEED_ORG_ID,
  role: 'OWNER',
};

describe('MemberAdminProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: MemberAdminProvider;
  let memberships: MembershipsRepository;
  let sessions: SessionsRepository;
  let apiTokens: ApiTokensRepository;
  let memberUserId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    memberships = new MembershipsRepository(handle.db, tenant);
    const organizations = new OrganizationsRepository(handle.db, tenant);
    sessions = new SessionsRepository(handle.db, tenant);
    apiTokens = new ApiTokensRepository(handle.db, tenant);
    const usersRepo = new UsersRepository(handle.db, tenant);
    const identityAccess = new IdentityAccessServiceImpl(sessions, apiTokens, systemClock);
    const provisioning = new UserProvisioningServiceImpl(
      usersRepo,
      new Argon2Hasher(cfg),
      systemClock,
    );
    provider = new MemberAdminProvider(
      memberships,
      organizations,
      identityAccess,
      provisioning,
      systemClock,
      new EventEmitter2(),
    );

    // A second member to administer (the DB mints the user id).
    const member = await usersRepo.create({
      organizationId: SEED_ORG_ID,
      email: 'member@rytask.local',
      name: 'Marisa Member',
    });
    memberUserId = member.id;
    await memberships.create({ organizationId: SEED_ORG_ID, userId: memberUserId, role: 'MEMBER' });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists members with their roles', async () => {
    const members = await tenant.run(ctxA, () => provider.listMembers());
    const ids = members.map((m) => m.userId);
    expect(ids).toContain(SEED_USER_ID);
    expect(ids).toContain(memberUserId);
  });

  it('forbids an Admin from promoting a member to OWNER (escalation ceiling, FR-RBAC-003)', async () => {
    const founderAsAdmin: Principal = {
      userId: SEED_USER_ID,
      organizationId: SEED_ORG_ID,
      role: 'ADMIN',
    };
    await expect(
      tenant.run(ctxA, () => provider.setMemberRole(founderAsAdmin, memberUserId, 'OWNER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The target's role is unchanged by the rejected promotion.
    expect(await tenant.run(ctxA, () => memberships.findRole(memberUserId))).toBe('MEMBER');
  });

  it('promotes a member, then blocks demoting the last owner (409, SC-015)', async () => {
    const updated = await tenant.run(ctxA, () =>
      provider.setMemberRole(founderOwner, memberUserId, 'ADMIN'),
    );
    expect(updated.role).toBe('ADMIN');

    await expect(
      tenant.run(ctxA, () => provider.setMemberRole(founderOwner, SEED_USER_ID, 'MEMBER')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('transfers ownership atomically (promote target, demote self)', async () => {
    await tenant.run(ctxA, () =>
      provider.transferOwnership(founderOwner, { toUserId: memberUserId, demoteSelfTo: 'ADMIN' }),
    );
    expect(await tenant.run(ctxA, () => memberships.findRole(memberUserId))).toBe('OWNER');
    expect(await tenant.run(ctxA, () => memberships.findRole(SEED_USER_ID))).toBe('ADMIN');
  });

  it('forbids an Admin from modifying an Owner (403)', async () => {
    const founderNowAdmin: Principal = {
      userId: SEED_USER_ID,
      organizationId: SEED_ORG_ID,
      role: 'ADMIN',
    };
    await expect(
      tenant.run(ctxA, () => provider.setMemberRole(founderNowAdmin, memberUserId, 'MEMBER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes a member, revoking their sessions + tokens (AC3)', async () => {
    // The founder is now ADMIN; give them a session + PAT, then the new owner removes them.
    await sessions.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      familyId: '0193b3a0-0000-7000-8000-0000000000e9',
      refreshTokenHash: 'admin-victim-session',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await apiTokens.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      type: 'PAT',
      name: 'victim token',
      tokenHash: 'admin-victim-token',
      scopes: [],
    });

    const memberAsOwner: Principal = {
      userId: memberUserId,
      organizationId: SEED_ORG_ID,
      role: 'OWNER',
    };
    await tenant.run(ctxA, () => provider.removeMember(memberAsOwner, SEED_USER_ID));

    expect(await tenant.run(ctxA, () => memberships.findRole(SEED_USER_ID))).toBeNull();
    expect(await tenant.run(ctxA, () => sessions.listActiveForUser(SEED_USER_ID))).toHaveLength(0);
    expect(await tenant.run(ctxA, () => apiTokens.listForUser(SEED_USER_ID))).toHaveLength(0);
  });

  it('merges org settings on update (does not replace)', async () => {
    await tenant.run(ctxA, () => provider.updateSettings({ allowPublicSignup: true }));
    const org = await tenant.run(ctxA, () =>
      provider.updateSettings({ timezone: 'Europe/Berlin' }),
    );
    expect(org.settings.timezone).toBe('Europe/Berlin');
    // The value set by the prior update survives the partial update (merge, not replace).
    expect(org.settings.allowPublicSignup).toBe(true);
  });
});
