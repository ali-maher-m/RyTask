import { createDb } from './client';
import { organizations, users, workspaces } from './tables';

/**
 * Deterministic seed (fixed UUIDv7 ids + fixed values) so `docker compose up`
 * and tests are reproducible (ARCHITECTURE §14.4). Idempotent via onConflictDoNothing.
 */
export const SEED_ORG_ID = '0193b3a0-0000-7000-8000-000000000001';
export const SEED_WORKSPACE_ID = '0193b3a0-0000-7000-8000-000000000002';
export const SEED_USER_ID = '0193b3a0-0000-7000-8000-000000000003';

export async function seed(
  connectionString: string | undefined = process.env.DATABASE_URL,
): Promise<void> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed');
  }
  const { db, pool } = createDb(connectionString);
  try {
    await db
      .insert(organizations)
      .values({ id: SEED_ORG_ID, name: 'RyTask Demo', slug: 'demo' })
      .onConflictDoNothing();
    await db
      .insert(workspaces)
      .values({
        id: SEED_WORKSPACE_ID,
        organizationId: SEED_ORG_ID,
        name: 'Default',
        slug: 'default',
      })
      .onConflictDoNothing();
    await db
      .insert(users)
      .values({
        id: SEED_USER_ID,
        organizationId: SEED_ORG_ID,
        email: 'founder@rytask.local',
        name: 'Founder',
      })
      .onConflictDoNothing();
  } finally {
    await pool.end();
  }
}

// `node dist/seed.js` / `tsx src/seed.ts`
if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
