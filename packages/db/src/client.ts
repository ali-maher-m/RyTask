import { type NodePgDatabase, drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { type Schema, schema } from './tables';

export type Database = NodePgDatabase<Schema>;

export interface DbHandle {
  db: Database;
  pool: Pool;
}

/**
 * Creates a Drizzle client over a pg Pool. This is the only place that opens a
 * connection; the API injects it behind a DI token (ports & adapters, §14.5).
 */
export function createDb(connectionString: string, config: PoolConfig = {}): DbHandle {
  const pool = new Pool({ connectionString, ...config });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
