import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Both files so drizzle-kit emits CREATE TYPE for enums (enums.ts) alongside the
  // tables (tables.ts) — tables.ts imports but does not re-export the enums.
  schema: ['./src/tables.ts', './src/enums.ts'],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://rytask:rytask@localhost:5432/rytask',
  },
  strict: true,
  verbose: true,
});
