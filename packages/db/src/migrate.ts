import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

/**
 * Runtime migrator (uses drizzle-orm, not the drizzle-kit dev CLI) so the
 * production image can run `node dist/migrate.js` without dev dependencies.
 * Transactional and safe to replay (ARCHITECTURE §15 — never db:push in prod).
 */
export async function runMigrations(
  connectionString: string | undefined = process.env.DATABASE_URL,
): Promise<void> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  const migrationsFolder = path.resolve(__dirname, '..', 'migrations');
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// `node dist/migrate.js` / `tsx src/migrate.ts`
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
