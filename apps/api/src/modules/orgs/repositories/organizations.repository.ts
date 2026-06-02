import { Inject, Injectable } from '@nestjs/common';
import { type Database, type Organization, type OrgSettings, organizations } from '@rytask/db';
import { eq, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/**
 * Reads/writes over the tenant root `organizations` (data-model §2.1). The org is the
 * tenant boundary itself, so it is scoped by `id = orgId` (from ALS) rather than the
 * `organizationId` column. `countAll` is intentionally global — the first-run bootstrap
 * gate (research D7) asks "do any orgs exist yet?" before any tenant context exists.
 */
@Injectable()
export class OrganizationsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Global org count for the first-run bootstrap gate (no tenant context). */
  async countAll(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(organizations);
    return Number(row?.count ?? 0);
  }

  /** Insert an organization (bootstrap; org explicit). */
  async create(data: { name: string; slug: string; settings?: OrgSettings }): Promise<Organization> {
    const [row] = await this.db
      .insert(organizations)
      .values({ name: data.name, slug: data.slug, settings: data.settings ?? {} })
      .returning();
    if (!row) {
      throw new Error('failed to create organization');
    }
    return row;
  }

  /** The first (single-org M0) organization, global — for the public-signup gate. */
  async first(): Promise<Organization | null> {
    const [row] = await this.db.select().from(organizations).limit(1);
    return row ?? null;
  }

  /** The current org (from ALS), or null. */
  async current(): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, this.tenant.getOrgId()))
      .limit(1);
    return row ?? null;
  }

  async updateSettings(settings: OrgSettings): Promise<Organization | null> {
    const [row] = await this.db
      .update(organizations)
      .set({ settings, updatedAt: new Date() })
      .where(eq(organizations.id, this.tenant.getOrgId()))
      .returning();
    return row ?? null;
  }

  /** Owner-only soft-delete (D14): set `deleted_at`; the v2 purge job consumes it. */
  async softDelete(at: Date): Promise<void> {
    await this.db
      .update(organizations)
      .set({ deletedAt: at, updatedAt: new Date() })
      .where(eq(organizations.id, this.tenant.getOrgId()));
  }
}
