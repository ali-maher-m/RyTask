import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  type ConfirmPasswordResetRequest,
  type RequestPasswordResetRequest,
  type RequestVerificationRequest,
  type VerifyEmailRequest,
  confirmPasswordResetSchema,
  requestPasswordResetSchema,
  requestVerificationSchema,
  verifyEmailSchema,
} from '@rytask/contracts';
import { Public } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { EmailVerificationProvider } from '../providers/email-verification.provider';
import { PasswordResetProvider } from '../providers/password-reset.provider';

/**
 * Account-recovery REST surface (contracts/openapi.yaml, FR-AUTH-003, SC-010). All three
 * routes are `@Public` (token-bearing — the one-time token in the body is the credential).
 * Request-reset always returns 202 (no account enumeration); verify/confirm return 204, or
 * 410 (GoneException) when the one-time token is invalid/used/expired.
 */
@Controller('auth')
export class AuthRecoveryController {
  constructor(
    private readonly reset: PasswordResetProvider,
    private readonly verification: EmailVerificationProvider,
  ) {}

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  verifyEmail(
    @Body(new ZodValidationPipe<VerifyEmailRequest>(verifyEmailSchema)) body: VerifyEmailRequest,
  ): Promise<void> {
    return this.verification.verifyEmail(body);
  }

  @Public()
  @Post('request-password-reset')
  @HttpCode(202)
  requestPasswordReset(
    @Body(new ZodValidationPipe<RequestPasswordResetRequest>(requestPasswordResetSchema))
    body: RequestPasswordResetRequest,
  ): Promise<void> {
    return this.reset.requestReset(body);
  }

  @Public()
  @Post('request-verification')
  @HttpCode(202)
  requestVerification(
    @Body(new ZodValidationPipe<RequestVerificationRequest>(requestVerificationSchema))
    body: RequestVerificationRequest,
  ): Promise<void> {
    return this.verification.requestVerification(body.email);
  }

  @Public()
  @Post('confirm-password-reset')
  @HttpCode(204)
  confirmPasswordReset(
    @Body(new ZodValidationPipe<ConfirmPasswordResetRequest>(confirmPasswordResetSchema))
    body: ConfirmPasswordResetRequest,
  ): Promise<void> {
    return this.reset.confirmReset(body);
  }
}
