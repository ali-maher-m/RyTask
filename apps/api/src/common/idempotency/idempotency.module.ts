import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * Provides the shared {@link IdempotencyService} to every controller (mutating routes opt in by
 * reading the `Idempotency-Key` header). `@Global` so controllers inject it by class without each
 * feature module importing this module. Backed by the @Global RedisModule.
 */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
