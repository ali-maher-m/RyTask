import { GoneException } from '@nestjs/common';
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
import { systemClock } from '../../../common/ports/clock.port';
import type { MailMessage, MailerPort } from '../../../common/ports/mailer.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { OneTimeTokensRepository } from '../repositories/one-time-tokens.repository';
import { UsersRepository } from '../repositories/users.repository';
import { EmailVerificationProvider } from './email-verification.provider';

/**
 * Integration test against REAL PostgreSQL (US6, FR-AUTH-003, research D9). Proves a
 * verification link is minted + emailed, consumed exactly once (re-use / bad / superseded
 * token → 410), the account is stamped verified, and `requestVerification` is a silent no-op
 * for unknown / already-verified accounts (no enumeration, SC-010).
 */
const tokenFrom = (body: string): string => {
  const token = body.split('token=')[1];
  if (!token) {
    throw new Error(`no token in verification email body: ${body}`);
  }
  return token;
};

describe('EmailVerificationProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let users: UsersRepository;
  let provider: EmailVerificationProvider;
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
    const tenant = new TenantContextService();
    users = new UsersRepository(handle.db, tenant);
    provider = new EmailVerificationProvider(
      users,
      new OneTimeTokensRepository(handle.db, tenant),
      new TokenHasher(cfg),
      mailer,
      systemClock,
      cfg,
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  const newUnverifiedUser = (email: string) =>
    users.create({ organizationId: SEED_ORG_ID, email, name: 'Unverified', passwordHash: null });

  it('issues + emails a link, then consumes it once to mark the account verified', async () => {
    const user = await newUnverifiedUser('verify-me@acme.test');
    sent.length = 0;
    await provider.issueVerification({
      organizationId: SEED_ORG_ID,
      userId: user.id,
      email: user.email,
    });
    const mail = sent.find((m) => m.to === 'verify-me@acme.test');
    expect(mail?.body).toContain('/verify?token=');
    const secret = tokenFrom(mail?.body ?? '');

    await provider.verifyEmail({ token: secret });
    const after = await users.findById(user.id);
    expect(after?.emailVerifiedAt).not.toBeNull();

    // Single-use: a second redemption of the same token → 410.
    await expect(provider.verifyEmail({ token: secret })).rejects.toBeInstanceOf(GoneException);
  });

  it('rejects an unknown token → 410', async () => {
    await expect(
      provider.verifyEmail({ token: 'rytask_otp_not-a-real-token' }),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('re-issuing supersedes the previous link (old token → 410)', async () => {
    const user = await newUnverifiedUser('resend@acme.test');
    sent.length = 0;
    await provider.issueVerification({
      organizationId: SEED_ORG_ID,
      userId: user.id,
      email: user.email,
    });
    const first = tokenFrom(sent.at(-1)?.body ?? '');
    await provider.issueVerification({
      organizationId: SEED_ORG_ID,
      userId: user.id,
      email: user.email,
    });
    const second = tokenFrom(sent.at(-1)?.body ?? '');
    expect(second).not.toBe(first);

    await expect(provider.verifyEmail({ token: first })).rejects.toBeInstanceOf(GoneException);
    await provider.verifyEmail({ token: second });
    expect((await users.findById(user.id))?.emailVerifiedAt).not.toBeNull();
  });

  it('requestVerification is a silent no-op for unknown + already-verified accounts', async () => {
    sent.length = 0;
    await provider.requestVerification('nobody@nowhere.test'); // unknown
    await provider.requestVerification('founder@rytask.local'); // already verified (seed)
    expect(sent).toHaveLength(0);
  });

  it('requestVerification re-issues for a known, unverified account', async () => {
    await newUnverifiedUser('pending@acme.test');
    sent.length = 0;
    await provider.requestVerification('pending@acme.test');
    expect(sent.some((m) => m.to === 'pending@acme.test')).toBe(true);
  });
});
