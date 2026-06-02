import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Membership, Organization, Role } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { MemberAdminProvider } from '../providers/member-admin.provider';

/**
 * Contract test for the org + member administration surface (T103, US8). The provider is
 * mocked, so this asserts the HTTP contract + the now-live RbacGuard: Owner-only
 * delete/transfer (ADMIN → 403), `org:settings:write` + `members:write` for OWNER/ADMIN
 * (MEMBER → 403), `members:read` (GUEST → 403), the 409 last-owner mapping, and validation.
 */
const cannedOrg: Organization = {
  id: SEED_ORG_ID,
  name: 'Acme',
  slug: 'acme',
  settings: { timezone: 'Europe/Berlin' },
};
const cannedMembership: Membership = {
  userId: 'u-2',
  user: { id: 'u-2', email: 'm@acme.test', name: 'Member', emailVerified: true },
  role: 'ADMIN',
  deactivatedAt: null,
};

const tokenFor = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

describe('Org + Memberships admin (contract)', () => {
  let app: INestApplication;
  const mockAdmin = {
    listMembers: vi.fn(async () => [cannedMembership]),
    updateSettings: vi.fn(async () => cannedOrg),
    softDeleteOrg: vi.fn(async () => undefined),
    setMemberRole: vi.fn(async () => cannedMembership),
    removeMember: vi.fn(async () => undefined),
    transferOwnership: vi.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MemberAdminProvider)
      .useValue(mockAdmin)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('PATCH /orgs/current (org:settings:write): OWNER 200, MEMBER 403', async () => {
    const ok = await request(server())
      .patch('/api/v1/orgs/current')
      .set('authorization', tokenFor('OWNER'))
      .send({ timezone: 'Europe/Berlin' });
    expect(ok.status).toBe(200);
    expect(ok.body.settings.timezone).toBe('Europe/Berlin');

    const denied = await request(server())
      .patch('/api/v1/orgs/current')
      .set('authorization', tokenFor('MEMBER'))
      .send({ timezone: 'Europe/Berlin' });
    expect(denied.status).toBe(403);
  });

  it('DELETE /orgs/current is Owner-only (OWNER 204, ADMIN 403)', async () => {
    const ok = await request(server())
      .delete('/api/v1/orgs/current')
      .set('authorization', tokenFor('OWNER'));
    expect(ok.status).toBe(204);

    const denied = await request(server())
      .delete('/api/v1/orgs/current')
      .set('authorization', tokenFor('ADMIN'));
    expect(denied.status).toBe(403);
  });

  it('POST /orgs/current/transfer-ownership is Owner-only (OWNER 204, ADMIN 403)', async () => {
    const ok = await request(server())
      .post('/api/v1/orgs/current/transfer-ownership')
      .set('authorization', tokenFor('OWNER'))
      .send({ toUserId: '0193b3a0-0000-7000-8000-0000000000aa' });
    expect(ok.status).toBe(204);

    const denied = await request(server())
      .post('/api/v1/orgs/current/transfer-ownership')
      .set('authorization', tokenFor('ADMIN'))
      .send({ toUserId: '0193b3a0-0000-7000-8000-0000000000aa' });
    expect(denied.status).toBe(403);
  });

  it('GET /memberships (members:read): MEMBER 200, GUEST 403', async () => {
    const ok = await request(server())
      .get('/api/v1/memberships')
      .set('authorization', tokenFor('MEMBER'));
    expect(ok.status).toBe(200);
    expect(ok.body[0].userId).toBe('u-2');

    const denied = await request(server())
      .get('/api/v1/memberships')
      .set('authorization', tokenFor('GUEST'));
    expect(denied.status).toBe(403);
  });

  it('PATCH /memberships/{userId} (members:write): ADMIN 200, MEMBER 403', async () => {
    const ok = await request(server())
      .patch('/api/v1/memberships/u-2')
      .set('authorization', tokenFor('ADMIN'))
      .send({ role: 'MEMBER' });
    expect(ok.status).toBe(200);

    const denied = await request(server())
      .patch('/api/v1/memberships/u-2')
      .set('authorization', tokenFor('MEMBER'))
      .send({ role: 'MEMBER' });
    expect(denied.status).toBe(403);
  });

  it('PATCH /memberships/{userId} last-owner → 409', async () => {
    mockAdmin.setMemberRole.mockRejectedValueOnce(
      new ConflictException('cannot demote the last owner'),
    );
    const res = await request(server())
      .patch('/api/v1/memberships/u-2')
      .set('authorization', tokenFor('OWNER'))
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(409);
  });

  it('PATCH /memberships/{userId} bad body → 400', async () => {
    const res = await request(server())
      .patch('/api/v1/memberships/u-2')
      .set('authorization', tokenFor('OWNER'))
      .send({ role: 'NOT_A_ROLE' });
    expect(res.status).toBe(400);
  });

  it('DELETE /memberships/{userId} (members:write): OWNER 204', async () => {
    const res = await request(server())
      .delete('/api/v1/memberships/u-2')
      .set('authorization', tokenFor('OWNER'));
    expect(res.status).toBe(204);
  });

  it('rejects unauthenticated admin calls (401)', async () => {
    expect((await request(server()).get('/api/v1/memberships')).status).toBe(401);
    expect((await request(server()).delete('/api/v1/orgs/current')).status).toBe(401);
  });
});
