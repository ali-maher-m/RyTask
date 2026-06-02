import { GoneException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { EmailVerificationProvider } from '../providers/email-verification.provider';
import { PasswordResetProvider } from '../providers/password-reset.provider';

/**
 * Contract test for the recovery surface (T085, US6). Providers are mocked, so this asserts
 * the HTTP contract — all three routes public (no token), the status codes (204 verify, 202
 * request, 204 confirm), 410 when the provider reports an invalid/used token, and 400 on
 * validation failure via the shared ZodValidationPipe.
 */
describe('AuthRecoveryController (contract)', () => {
  let app: INestApplication;
  const mockReset = {
    requestReset: vi.fn(async () => undefined),
    confirmReset: vi.fn(async () => undefined),
  };
  const mockVerification = { verifyEmail: vi.fn(async () => undefined) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordResetProvider)
      .useValue(mockReset)
      .overrideProvider(EmailVerificationProvider)
      .useValue(mockVerification)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/request-password-reset → 202 (public, always)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'someone@x.test' });
    expect(res.status).toBe(202);
  });

  it('POST /auth/request-password-reset bad email → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/confirm-password-reset → 204', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/confirm-password-reset')
      .send({ token: 'rytask_otp_x', newPassword: 'a-good-password' });
    expect(res.status).toBe(204);
  });

  it('POST /auth/confirm-password-reset short password → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/confirm-password-reset')
      .send({ token: 'rytask_otp_x', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/confirm-password-reset invalid/used token → 410', async () => {
    mockReset.confirmReset.mockRejectedValueOnce(
      new GoneException('this reset link is no longer valid'),
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/confirm-password-reset')
      .send({ token: 'rytask_otp_dead', newPassword: 'a-good-password' });
    expect(res.status).toBe(410);
  });

  it('POST /auth/verify-email → 204', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'rytask_otp_v' });
    expect(res.status).toBe(204);
  });

  it('POST /auth/verify-email expired/used → 410', async () => {
    mockVerification.verifyEmail.mockRejectedValueOnce(
      new GoneException('this verification link is no longer valid'),
    );
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'rytask_otp_dead' });
    expect(res.status).toBe(410);
  });
});
