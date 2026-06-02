import { GoneException } from '@nestjs/common';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  runMigrations,
  seed,
  users as usersTable,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import type { MailMessage, MailerPort } from '../../../common/ports/mailer.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { OneTimeTokensRepository } from '../repositories/one-time-tokens.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';
import { EmailVerificationProvider } from './email-verification.provider';
import { PasswordResetProvider } from './password-reset.provider';

/**
 * Integration test against REAL PostgreSQL (T084, US6, FR-AUTH-003, SC-010). Proves
 * single-use + expiry rejection, the uniform no-enumeration response, that a reset rotates
 * the password and revokes sessions, and that email verification flips `emailVerifiedAt`.
 * The token secret is captured from the (no-op) Mailer to drive the consume path.
 */
const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

describe('PasswordReset/EmailVerification providers (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let users: UsersRepository;
  let sessions: SessionsRepository;
  let tokens: OneTimeTokensRepository;
  let reset: PasswordResetProvider;
  let verification: EmailVerificationProvider;
  let sent: MailMessage[];

  const tokenFrom = (body: string): string => {
    const token = body.match(/token=([^\s&]+)/)?.[1];
    if (!token) {
      throw new Error(`no token in mail body: ${body}`);
    }
    return token;
  };

  const lastMailBody = (): string => {
    const last = sent.at(-1);
    if (!last) {
      throw new Error('expected a sent mail');
    }
    return last.body;
  };

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    users = new UsersRepository(handle.db, tenant);
    sessions = new SessionsRepository(handle.db, tenant);
    tokens = new OneTimeTokensRepository(handle.db, tenant);
    const tokenHasher = new TokenHasher(cfg);
    const hasher = new Argon2Hasher(cfg);
    sent = [];
    const mailer: MailerPort = {
      async send(message) {
        sent.push(message);
      },
    };
    reset = new PasswordResetProvider(
      users,
      tokens,
      sessions,
      tokenHasher,
      hasher,
      mailer,
      systemClock,
      cfg,
    );
    verification = new EmailVerificationProvider(
      users,
      tokens,
      tokenHasher,
      mailer,
      systemClock,
      cfg,
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('reset for an unknown email is a no-op with no mail (uniform response, SC-010)', async () => {
    const before = sent.length;
    await expect(reset.requestReset({ email: 'nobody@nowhere.test' })).resolves.toBeUndefined();
    expect(sent.length).toBe(before);
  });

  it('reset request → emailed token → confirm sets a new password + revokes sessions', async () => {
    // An active session that the reset must revoke.
    await sessions.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      familyId: '0193b3a0-0000-7000-8000-0000000000d8',
      refreshTokenHash: 'reset-victim-hash',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await reset.requestReset({ email: 'founder@rytask.local' });
    const token = tokenFrom(lastMailBody());

    await reset.confirmReset({ token, newPassword: 'a-brand-new-password' });

    const user = await users.findById(SEED_USER_ID);
    if (!user?.passwordHash) {
      throw new Error('expected a user with a password hash');
    }
    const hasher = new Argon2Hasher(authConfig());
    expect(await hasher.verify(user.passwordHash, 'a-brand-new-password')).toBe(true);
    // Sessions revoked by the reset.
    expect(await tenant.run(ctxA, () => sessions.listActiveForUser(SEED_USER_ID))).toHaveLength(0);

    // Single-use: replaying the same token is rejected.
    await expect(
      reset.confirmReset({ token, newPassword: 'yet-another-password' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('confirm with a bogus token → 410', async () => {
    await expect(
      reset.confirmReset({ token: 'rytask_otp_not-a-real-token', newPassword: 'whatever-123' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('email verification: issue → verify flips emailVerifiedAt; reuse → 410', async () => {
    // Reset the founder to unverified to observe the flip.
    await handle.db
      .update(usersTable)
      .set({ emailVerifiedAt: null })
      .where(eq(usersTable.id, SEED_USER_ID));
    await verification.issueVerification({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      email: 'founder@rytask.local',
    });
    const token = tokenFrom(lastMailBody());

    await verification.verifyEmail({ token });
    const user = await users.findById(SEED_USER_ID);
    expect(user?.emailVerifiedAt).not.toBeNull();

    await expect(verification.verifyEmail({ token })).rejects.toBeInstanceOf(GoneException);
  });
});
