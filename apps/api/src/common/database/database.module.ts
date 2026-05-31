import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { type Database, type DbHandle, createDb } from '@rytask/db';

/** DI token for the Drizzle database instance. */
export const DB = Symbol('DB');
/** DI token for the underlying handle (db + pool), used for clean shutdown. */
export const DB_HANDLE = Symbol('DB_HANDLE');

const DEFAULT_DATABASE_URL = 'postgres://rytask:rytask@localhost:5432/rytask';

/**
 * Owns the single Drizzle connection (ports & adapters, §14.5). The pool is lazy —
 * no connection is opened until the first query — so bootstrapping without a live
 * Postgres (e.g. the /healthz contract test) is fine.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      useFactory: (): DbHandle => createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL),
    },
    {
      provide: DB,
      useFactory: (handle: DbHandle): Database => handle.db,
      inject: [DB_HANDLE],
    },
  ],
  exports: [DB, DB_HANDLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onModuleDestroy(): Promise<void> {
    await this.handle.pool.end();
  }
}
