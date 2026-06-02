import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthResult } from '@rytask/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { BootstrapFirstRunProvider } from '../providers/bootstrap-first-run.provider';

/**
 * Contract test for the first-run surface (T032, US1). The provider is mocked, so this
 * asserts the HTTP contract — `GET /setup` availability, `POST /setup` 201 (AuthResult), and
 * the 409 once bootstrapped. Both routes are public (no token). Validation rejects via the
 * shared ZodValidationPipe (400 — repo-wide convention).
 */
const cannedAuth: AuthResult = {
  accessToken: 'access.jwt.token',
  refreshToken: 'rytask_rt_opaque',
  expiresIn: 900,
  user: { id: 'u1', email: 'ada@acme.test', name: 'Ada', emailVerified: true },
};

describe('SetupController (contract)', () => {
  let app: INestApplication;
  const mockBootstrap = {
    isAvailable: vi.fn(async () => true),
    bootstrap: vi.fn(async () => cannedAuth),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BootstrapFirstRunProvider)
      .useValue(mockBootstrap)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /setup → 200 { available: true } while un-bootstrapped', async () => {
    mockBootstrap.isAvailable.mockResolvedValueOnce(true);
    const res = await request(app.getHttpServer()).get('/api/v1/setup');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
  });

  it('GET /setup → { available: false } once bootstrapped', async () => {
    mockBootstrap.isAvailable.mockResolvedValueOnce(false);
    const res = await request(app.getHttpServer()).get('/api/v1/setup');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it('POST /setup → 201 AuthResult', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/setup').send({
      organizationName: 'Acme Inc',
      ownerName: 'Ada',
      ownerEmail: 'ada@acme.test',
      ownerPassword: 'super-secret-pw',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe('ada@acme.test');
  });

  it('POST /setup missing fields → 400 (validation)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/setup')
      .send({ organizationName: 'Acme Inc' });
    expect(res.status).toBe(400);
  });

  it('POST /setup short password → 400 (validation)', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/setup').send({
      organizationName: 'Acme Inc',
      ownerName: 'Ada',
      ownerEmail: 'ada@acme.test',
      ownerPassword: 'short',
    });
    expect(res.status).toBe(400);
  });

  it('POST /setup once bootstrapped → 409', async () => {
    mockBootstrap.bootstrap.mockRejectedValueOnce(new ConflictException('already bootstrapped'));
    const res = await request(app.getHttpServer()).post('/api/v1/setup').send({
      organizationName: 'Second',
      ownerName: 'Eve',
      ownerEmail: 'eve@evil.test',
      ownerPassword: 'another-pw-123',
    });
    expect(res.status).toBe(409);
  });
});
