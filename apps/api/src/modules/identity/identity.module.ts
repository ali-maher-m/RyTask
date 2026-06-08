import { Global, Module } from '@nestjs/common';
import { ApiTokensController } from './controllers/api-tokens.controller';
import { AuthRecoveryController } from './controllers/auth-recovery.controller';
import { AuthController } from './controllers/auth.controller';
import { WhoamiController } from './controllers/whoami.controller';
import { IDENTITY_ACCESS, SESSION_ISSUER, USER_PROVISIONING } from './identity.contract';
import { ApiTokensProvider } from './providers/api-tokens.provider';
import { EmailVerificationProvider } from './providers/email-verification.provider';
import { LoginProvider } from './providers/login.provider';
import { LogoutProvider } from './providers/logout.provider';
import { PasswordResetProvider } from './providers/password-reset.provider';
import { RefreshProvider } from './providers/refresh.provider';
import { RegisterProvider } from './providers/register.provider';
import { WhoamiProvider } from './providers/whoami.provider';
import { ApiTokensRepository } from './repositories/api-tokens.repository';
import { OneTimeTokensRepository } from './repositories/one-time-tokens.repository';
import { SessionsRepository } from './repositories/sessions.repository';
import { UsersRepository } from './repositories/users.repository';
import { AuthService } from './services/auth.service';
import { BruteForceService } from './services/brute-force.service';
import { IdentityAccessServiceImpl } from './services/identity-access.service';
import { TokenSigner } from './services/token-signer.service';
import { TokenVerifier } from './services/token-verifier.service';
import { UserProvisioningServiceImpl } from './services/user-provisioning.service';

/**
 * Identity bounded context (data-model §4): owns `users` (auth columns), `sessions`,
 * `api_tokens`, `one_time_tokens` — auth, sessions, PATs, verify/reset, whoami. `@Global`
 * so the cross-module `SESSION_ISSUER` / `IDENTITY_ACCESS` ports and `TokenVerifier` (used by
 * the tenant-context middleware) are injectable. US2 wires auth + sessions + whoami; US6
 * verify/reset; US7 PATs.
 */
@Global()
@Module({
  controllers: [AuthController, AuthRecoveryController, ApiTokensController, WhoamiController],
  providers: [
    UsersRepository,
    SessionsRepository,
    OneTimeTokensRepository,
    ApiTokensRepository,
    TokenSigner,
    TokenVerifier,
    AuthService,
    BruteForceService,
    LoginProvider,
    RegisterProvider,
    RefreshProvider,
    LogoutProvider,
    WhoamiProvider,
    PasswordResetProvider,
    EmailVerificationProvider,
    ApiTokensProvider,
    IdentityAccessServiceImpl,
    UserProvisioningServiceImpl,
    { provide: SESSION_ISSUER, useExisting: AuthService },
    { provide: IDENTITY_ACCESS, useExisting: IdentityAccessServiceImpl },
    { provide: USER_PROVISIONING, useExisting: UserProvisioningServiceImpl },
  ],
  // WhoamiProvider + ApiTokensProvider are exported for the MCP transport edge (M3, US4): the
  // context + token tools dispatch to the SAME providers the REST whoami/api-token routes use.
  exports: [
    SESSION_ISSUER,
    IDENTITY_ACCESS,
    USER_PROVISIONING,
    TokenVerifier,
    WhoamiProvider,
    ApiTokensProvider,
  ],
})
export class IdentityModule {}
