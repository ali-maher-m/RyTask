import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from './clock.port';
import { ID_GENERATOR, systemIdGenerator } from './id-generator.port';

/**
 * Binds the edge ports (Clock, IdGenerator) to their system implementations
 * (ports & adapters, §14.5). `@Global` so any module injects them by token; tests
 * override with deterministic fakes.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: ID_GENERATOR, useValue: systemIdGenerator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class PortsModule {}
