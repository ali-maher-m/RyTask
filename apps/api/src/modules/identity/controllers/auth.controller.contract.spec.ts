import { ForbiddenException, type INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResult, WhoAmI } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { LoginProvider } from '../providers/login.provider';
import { LogoutProvider } from '../providers/logout.provider';
import { RefreshProvider } from '../providers/refresh.provider';
import { RegisterProvider } from '../providers/register.provider';
import { WhoamiProvider } from '../providers/whoami.provider';

/**
 * Contract test for the auth surface (T045, US2). Providers are mocked, so this asserts the
 * HTTP contract — public register/login/refresh, the generic 401 on bad credentials (no
 * enumeration), and that the now-live AuthGuard rejects logout/whoami without a token (401).
 */
const cannedAuth: AuthResult = {
  accessToken: 'access.jwt',
  refreshToken: 'rytask_rt_x',
  expiresIn: 900,
  user: { id: SEED_USER_ID, email: 'founder@rytask.local', name: 'Founder', emailVerified: true },
};
const cannedWhoami: WhoAmI = {
  user: cannedAuth.user,
  organizationId: SEED_ORG_ID,
  activeWorkspaceId: SEED_WORKSPACE_ID,
  role: 'OWNER',
  scopes: [],
  workspaces: [],
};

const ownerToken = (): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role: 'OWNER',
  });

describe('AuthController (contract)', () => {
  let app: INestApplication;
  const mockLogin = { login: vi.fn(async () => cannedAuth) };
  const mockRegister = { register: vi.fn(async () => cannedAuth) };
  const mockRefresh = { refresh: vi.fn(async () => cannedAuth) };
  const mockLogout = { logout: vi.fn(async () => undefined) };
  const mockWhoami = { build: vi.fn(async () => cannedWhoami) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LoginProvider)
      .useValue(mockLogin)
      .overrideProvider(RegisterProvider)
      .useValue(mockRegister)
      .overrideProvider(RefreshProvider)
      .useValue(mockRefresh)
      .overrideProvider(LogoutProvider)
      .useValue(mockLogout)
      .overrideProvider(WhoamiProvider)
      .useValue(mockWhoami)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login → 200 AuthResult (public)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'founder@rytask.local', password: 'rytask-dev-password' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('POST /auth/login invalid creds → generic 401 (no enumeration)', async () => {
    mockLogin.login.mockRejectedValueOnce(new UnauthorizedException('invalid credentials'));
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'founder@rytask.local', password: 'nope' });
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('founder@rytask.local');
  });

  it('POST /auth/login bad body → 400', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/register disabled signup → 403', async () => {
    mockRegister.register.mockRejectedValueOnce(
      new ForbiddenException('public signup is disabled'),
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'New', email: 'new@x.test', password: 'a-good-password' });
    expect(res.status).toBe(403);
  });

  it('POST /auth/refresh → 200 (public, token-bearing)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'rytask_rt_abc' });
    expect(res.status).toBe(200);
  });

  it('POST /auth/logout without a token → 401 (AuthGuard live)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout with a token → 204', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('authorization', ownerToken());
    expect(res.status).toBe(204);
  });

  it('GET /auth/whoami without a token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/whoami');
    expect(res.status).toBe(401);
  });

  it('GET /auth/whoami with a token → 200 principal', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/whoami')
      .set('authorization', ownerToken());
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.organizationId).toBe(SEED_ORG_ID);
  });
});
