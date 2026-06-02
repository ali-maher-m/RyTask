import { GoneException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResult, Invitation, InvitationCreated, InvitePreview } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { AcceptInviteProvider } from '../providers/accept-invite.provider';
import { InviteProvider } from '../providers/invite.provider';

/**
 * Contract test for the invitations surface (T062, US3). Providers are mocked, so this
 * asserts the HTTP contract — `members:invite`/`members:read` routes require a token (the
 * live AuthGuard → 401 without one), the public `GET /invites/{token}` preview (+ 410 when
 * not live) and `POST /invites/{token}/accept`, and validation (400) via the shared
 * ZodValidationPipe. RBAC enforcement itself lands in US4.
 */
const cannedInvitation: Invitation = {
  id: 'inv-1',
  email: 'invitee@acme.test',
  role: 'MEMBER',
  invitedByUserId: SEED_USER_ID,
  expiresAt: '2026-06-09T00:00:00.000Z',
  createdAt: '2026-06-02T00:00:00.000Z',
};
const cannedCreated: InvitationCreated = {
  ...cannedInvitation,
  acceptUrl: 'http://localhost:3000/invite/rytask_inv_secret',
};
const cannedPreview: InvitePreview = {
  organizationName: 'Acme Inc',
  role: 'MEMBER',
  email: 'invitee@acme.test',
};
const cannedAuth: AuthResult = {
  accessToken: 'access.jwt',
  refreshToken: 'rytask_rt_x',
  expiresIn: 900,
  user: { id: 'u-new', email: 'invitee@acme.test', name: 'Invitee', emailVerified: true },
};

const ownerToken = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('InvitesController (contract)', () => {
  let app: INestApplication;
  const mockInvite = {
    list: vi.fn(async () => [cannedInvitation]),
    create: vi.fn(async () => cannedCreated),
    preview: vi.fn(async () => cannedPreview),
    revoke: vi.fn(async () => undefined),
  };
  const mockAccept = { accept: vi.fn(async () => cannedAuth) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(InviteProvider)
      .useValue(mockInvite)
      .overrideProvider(AcceptInviteProvider)
      .useValue(mockAccept)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /invites without a token → 401 (AuthGuard live)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/invites');
    expect(res.status).toBe(401);
  });

  it('GET /invites with a token → 200 array', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/invites')
      .set('authorization', ownerToken());
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe('inv-1');
  });

  it('POST /invites without a token → 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/invites').send({ role: 'MEMBER' });
    expect(res.status).toBe(401);
  });

  it('POST /invites with a token → 201 InvitationCreated', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('authorization', ownerToken())
      .send({ email: 'invitee@acme.test', role: 'MEMBER' });
    expect(res.status).toBe(201);
    expect(res.body.acceptUrl).toContain('/invite/');
  });

  it('POST /invites bad body → 400 (validation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invites')
      .set('authorization', ownerToken())
      .send({ role: 'NOT_A_ROLE' });
    expect(res.status).toBe(400);
  });

  it('GET /invites/{token} → 200 preview (public)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/invites/rytask_inv_secret');
    expect(res.status).toBe(200);
    expect(res.body.organizationName).toBe('Acme Inc');
  });

  it('GET /invites/{token} when not live → 410', async () => {
    mockInvite.preview.mockRejectedValueOnce(
      new GoneException('this invitation is no longer valid'),
    );
    const res = await request(app.getHttpServer()).get('/api/v1/invites/rytask_inv_dead');
    expect(res.status).toBe(410);
  });

  it('POST /invites/{token}/accept → 200 AuthResult (public)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/invites/rytask_inv_secret/accept')
      .send({ name: 'Invitee', password: 'a-good-password' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('DELETE /invites/{id}/_revoke without a token → 401', async () => {
    const res = await request(app.getHttpServer()).delete('/api/v1/invites/inv-1/_revoke');
    expect(res.status).toBe(401);
  });

  it('DELETE /invites/{id}/_revoke with a token → 204', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/invites/inv-1/_revoke')
      .set('authorization', ownerToken());
    expect(res.status).toBe(204);
  });
});
