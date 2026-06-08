import { Global, Module } from '@nestjs/common';
import { SlackAdapter } from '../adapters/slack/slack.adapter';
import { TokenHasher } from '../auth/token-hasher';
import { type IntegrationsConfigType, integrationsConfig } from '../config/integrations.config';
import { AesGcmCrypto } from '../crypto/aes-gcm-crypto.adapter';
import { CRYPTO } from '../crypto/crypto.port';
import { Argon2Hasher } from './argon2-hasher.adapter';
import { CLOCK, systemClock } from './clock.port';
import { ID_GENERATOR, systemIdGenerator } from './id-generator.port';
import { MAILER, noopMailer } from './mailer.port';
import { PASSWORD_HASHER } from './password-hasher.port';
import { SLACK, type SlackPort, noopSlack } from './slack.port';

/**
 * Binds the edge ports (Clock, IdGenerator, PasswordHasher, TokenHasher, Mailer, Crypto, Slack)
 * to their implementations (ports & adapters, §14.5). `@Global` so any module injects them by
 * token; tests override with deterministic fakes. The Slack binding is **env-selected**: the
 * real adapter when Slack is configured, else `noopSlack` so the API runs Slack-inert (M3, D3).
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: ID_GENERATOR, useValue: systemIdGenerator },
    { provide: PASSWORD_HASHER, useClass: Argon2Hasher },
    { provide: MAILER, useValue: noopMailer },
    { provide: CRYPTO, useClass: AesGcmCrypto },
    {
      provide: SLACK,
      inject: [integrationsConfig.KEY],
      useFactory: (config: IntegrationsConfigType): SlackPort =>
        config.slack.configured ? new SlackAdapter(config) : noopSlack,
    },
    TokenHasher,
  ],
  exports: [CLOCK, ID_GENERATOR, PASSWORD_HASHER, MAILER, CRYPTO, SLACK, TokenHasher],
})
export class PortsModule {}
