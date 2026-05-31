import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Drizzle schema — the SINGLE SOURCE OF TRUTH for the data model (ARCHITECTURE §5, §16.1).
 *
 * Tenancy spine only (M0 foundation): organizations -> workspaces -> users.
 * Every tenant-scoped table carries `organization_id NOT NULL` with a composite index
 * leading on `organization_id` (ADR-002 row-level multi-tenancy, §4.2). IDs are UUIDv7
 * (sortable + safe to expose, ADR-003). Timestamps are `timestamptz`.
 */

/** UUIDv7 primary key, generated app-side (PG16 has no native uuidv7). */
const primaryId = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** The tenant root. An Organization is the tenant boundary (FR-TEN). */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('organizations_slug_unique').on(t.slug)],
);

/** Workspaces live inside an organization. */
export const workspaces = pgTable(
  'workspaces',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (t) => [
    index('workspaces_org_idx').on(t.organizationId),
    uniqueIndex('workspaces_org_slug_unique').on(t.organizationId, t.slug),
  ],
);

/** Users are scoped to an organization (membership). */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => [
    index('users_org_idx').on(t.organizationId),
    uniqueIndex('users_org_email_unique').on(t.organizationId, t.email),
  ],
);

export const schema = { organizations, workspaces, users };
export type Schema = typeof schema;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
