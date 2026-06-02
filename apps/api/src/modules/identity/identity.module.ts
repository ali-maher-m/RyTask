import { Global, Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller';
import { WhoamiController } from './controllers/whoami.controller';
import { IDENTITY_ACCESS, SESSION_ISSUER } from './identity.contract';
import { LoginProvider } from './providers/login.provider';
import { LogoutProvider } from './providers/logout.provider';
import { RefreshProvider } from './providers/refresh.provider';
import { RegisterProvider } from './providers/register.provider';
import { WhoamiProvider } from './providers/whoami.provider';
import { SessionsRepository } from './repositories/sessions.repository';
import { UsersRepository } from './repositories/users.repository';
import { AuthService } from './services/auth.service';
import { IdentityAccessServiceImpl } from './services/identity-access.service';
import { TokenSigner } from './services/token-signer.service';
import { TokenVerifier } from './services/token-verifier.service';

/**
 * Identity bounded context (data-model §4): owns `users` (auth columns), `sessions`,
 * `api_tokens`, `one_time_tokens` — auth, sessions, PATs, verify/reset, whoami. `@Global`
 * so the cross-module `SESSION_ISSUER` / `IDENTITY_ACCESS` ports and `TokenVerifier` (used by
 * the tenant-context middleware) are injectable. US2 wires auth + sessions + whoami; US6
 * verify/reset; US7 PATs.
 */
@Global()
@Module({
  controllers: [AuthController, WhoamiController],
  providers: [
    UsersRepository,
    SessionsRepository,
    TokenSigner,
    TokenVerifier,
    AuthService,
    LoginProvider,
    RegisterProvider,
    RefreshProvider,
    LogoutProvider,
    WhoamiProvider,
    IdentityAccessServiceImpl,
    { provide: SESSION_ISSUER, useExisting: AuthService },
    { provide: IDENTITY_ACCESS, useExisting: IdentityAccessServiceImpl },
  ],
  exports: [SESSION_ISSUER, IDENTITY_ACCESS, TokenVerifier],
})
export class IdentityModule {}
