import { GoneException, Inject, Injectable } from '@nestjs/common';
import type { ConfirmPasswordResetRequest, RequestPasswordResetRequest } from '@rytask/contracts';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { MAILER, type MailerPort } from '../../../common/ports/mailer.port';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import { OneTimeTokensRepository } from '../repositories/one-time-tokens.repository';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';

/** Opaque one-time-token prefix (shown only inside the emailed link, never stored). */
const OTP_PREFIX = 'rytask_otp_';
/** Reset links are short-lived (research D9, FR-AUTH-003). */
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Password-reset flow (US6, FR-AUTH-003, SC-010, research D9). A reset **request** returns a
 * uniform response whether or not the email exists (no account enumeration) — it silently
 * issues + emails a single-use, time-limited token only for a real, active account.
 * **Confirm** consumes the token (single-use), sets the new password, and revokes every
 * existing session (a reset invalidates active credentials). Bad/used/expired token → 410.
 */
@Injectable()
export class PasswordResetProvider {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: OneTimeTokensRepository,
    private readonly sessions: SessionsRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
  ) {}

  /** Request a reset — uniform response, no enumeration (SC-010). Returns the secret in dev/tests. */
  async requestReset(input: RequestPasswordResetRequest): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user || user.deactivatedAt !== null) {
      return; // Indistinguishable from the success path — no account-existence signal.
    }
    const now = this.clock.now();
    await this.tokens.consumeAllForUser(user.organizationId, user.id, 'PASSWORD_RESET', now);
    const secret = this.tokenHasher.generate(OTP_PREFIX);
    await this.tokens.issue({
      organizationId: user.organizationId,
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: this.tokenHasher.hash(secret),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    });
    await this.mailer.send({
      to: user.email,
      subject: 'Reset your RyTask password',
      body: `Reset your password: ${this.config.appBaseUrl}/reset?token=${secret}`,
    });
  }

  /** Consume a reset token and set the new password; 410 if it is invalid/used/expired. */
  async confirmReset(input: ConfirmPasswordResetRequest): Promise<void> {
    const now = this.clock.now();
    const token = await this.tokens.findByHash(this.tokenHasher.hash(input.token));
    if (
      !token ||
      token.purpose !== 'PASSWORD_RESET' ||
      token.consumedAt !== null ||
      token.expiresAt.getTime() <= now.getTime()
    ) {
      throw new GoneException('this reset link is no longer valid');
    }
    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.users.setPasswordHash(token.userId, passwordHash);
    await this.tokens.consume(token.id, now);
    // A password reset invalidates every existing session (NFR-SEC).
    await this.sessions.revokeAllForUser(token.organizationId, token.userId, now);
  }
}
