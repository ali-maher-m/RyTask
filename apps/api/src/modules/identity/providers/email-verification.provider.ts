import { GoneException, Inject, Injectable } from '@nestjs/common';
import type { VerifyEmailRequest } from '@rytask/contracts';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { MAILER, type MailerPort } from '../../../common/ports/mailer.port';
import { OneTimeTokensRepository } from '../repositories/one-time-tokens.repository';
import { UsersRepository } from '../repositories/users.repository';

const OTP_PREFIX = 'rytask_otp_';
/** Verification links live a day (research D9). */
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Email-verification flow (US6, FR-AUTH-003, research D9). Shares the single-use,
 * time-limited `one_time_tokens` mechanism with password reset (purpose `EMAIL_VERIFY`).
 * `issueVerification` mints + emails a link (called after self-registration / on resend);
 * `verifyEmail` consumes it and stamps `emailVerifiedAt`. Bad/used/expired token → 410.
 */
@Injectable()
export class EmailVerificationProvider {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: OneTimeTokensRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
  ) {}

  /** Issue + email a verification link (supersedes any outstanding one). */
  async issueVerification(params: {
    organizationId: string;
    userId: string;
    email: string;
  }): Promise<void> {
    const now = this.clock.now();
    await this.tokens.consumeAllForUser(params.organizationId, params.userId, 'EMAIL_VERIFY', now);
    const secret = this.tokenHasher.generate(OTP_PREFIX);
    await this.tokens.issue({
      organizationId: params.organizationId,
      userId: params.userId,
      purpose: 'EMAIL_VERIFY',
      tokenHash: this.tokenHasher.hash(secret),
      expiresAt: new Date(now.getTime() + VERIFY_TTL_MS),
    });
    await this.mailer.send({
      to: params.email,
      subject: 'Verify your RyTask email',
      body: `Verify your email: ${this.config.appBaseUrl}/verify?token=${secret}`,
    });
  }

  /** Consume a verification token and mark the account verified; 410 if invalid/used/expired. */
  async verifyEmail(input: VerifyEmailRequest): Promise<void> {
    const now = this.clock.now();
    const token = await this.tokens.findByHash(this.tokenHasher.hash(input.token));
    if (
      !token ||
      token.purpose !== 'EMAIL_VERIFY' ||
      token.consumedAt !== null ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      throw new GoneException('this verification link is no longer valid');
    }
    await this.users.markEmailVerified(token.userId, now);
    await this.tokens.consume(token.id, now);
  }
}
