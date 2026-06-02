import { Inject, Injectable } from '@nestjs/common';
import { type Database, type Membership, type RoleType, memberships } from '@rytask/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/**
 * Tenant-scoped reads/writes over `memberships` (data-model §3.1, FR-RBAC-001) — the
 * role-bearing record. `countActiveOwners` backs the last-owner invariant (D13).
 */
@Injectable()
export class MembershipsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a membership (bootstrap/accept-invite; org explicit). */
  async create(data: {
    organizationId: string;
    userId: string;
    role: RoleType;
    workspaceId?: string | null;
  }): Promise<Membership> {
    const [row] = await this.db
      .insert(memberships)
      .values({
        organizationId: data.organizationId,
        userId: data.userId,
        role: data.role,
        workspaceId: data.workspaceId ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to create membership');
    }
    return row;
  }

  /** The active membership for a user in the current org, or null. */
  async findByUser(userId: string): Promise<Membership | null> {
    const [row] = await this.db
      .select()
      .from(memberships)
      .where(this.scoped(memberships, eq(memberships.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /** A user's active role in the current org, or null (null also when deactivated). */
  async findRole(userId: string): Promise<RoleType | null> {
    const [row] = await this.db
      .select({ role: memberships.role, deactivatedAt: memberships.deactivatedAt })
      .from(memberships)
      .where(this.scoped(memberships, eq(memberships.userId, userId)))
      .limit(1);
    if (!row || row.deactivatedAt) {
      return null;
    }
    return row.role;
  }

  /** All memberships in the current org (creation order). */
  async list(): Promise<Membership[]> {
    return this.db
      .select()
      .from(memberships)
      .where(this.orgScope(memberships))
      .orderBy(asc(memberships.id));
  }

  async setRole(userId: string, role: RoleType): Promise<Membership | null> {
    const [row] = await this.db
      .update(memberships)
      .set({ role, updatedAt: new Date() })
      .where(this.scoped(memberships, eq(memberships.userId, userId)))
      .returning();
    return row ?? null;
  }

  /** Count active OWNERs in the current org (last-owner guard, D13). */
  async countActiveOwners(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(memberships)
      .where(
        this.scoped(memberships, eq(memberships.role, 'OWNER'), isNull(memberships.deactivatedAt)),
      );
    return Number(row?.count ?? 0);
  }

  /** Set/clear a membership's deactivation marker (member removal/reactivation, US8). */
  async setDeactivated(userId: string, at: Date | null): Promise<void> {
    await this.db
      .update(memberships)
      .set({ deactivatedAt: at, updatedAt: new Date() })
      .where(this.scoped(memberships, eq(memberships.userId, userId)));
  }
}
