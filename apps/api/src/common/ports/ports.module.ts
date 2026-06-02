import { Global, Module } from '@nestjs/common';
import { TokenHasher } from '../auth/token-hasher';
import { Argon2Hasher } from './argon2-hasher.adapter';
import { CLOCK, systemClock } from './clock.port';
import { ID_GENERATOR, systemIdGenerator } from './id-generator.port';
import { MAILER, noopMailer } from './mailer.port';
import { PASSWORD_HASHER } from './password-hasher.port';

/**
 * Binds the edge ports (Clock, IdGenerator, PasswordHasher, TokenHasher, Mailer) to their
 * implementations (ports & adapters, §14.5). `@Global` so any module injects them by
 * token; tests override with deterministic fakes.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: ID_GENERATOR, useValue: systemIdGenerator },
    { provide: PASSWORD_HASHER, useClass: Argon2Hasher },
    { provide: MAILER, useValue: noopMailer },
    TokenHasher,
  ],
  exports: [CLOCK, ID_GENERATOR, PASSWORD_HASHER, MAILER, TokenHasher],
})
export class PortsModule {}
