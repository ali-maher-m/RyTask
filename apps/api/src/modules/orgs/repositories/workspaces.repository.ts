import { Inject, Injectable } from '@nestjs/common';
import { type Database, type Workspace, workspaces } from '@rytask/db';
import { asc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/**
 * Tenant-scoped reads/writes over `workspaces` (data-model §2, FR-TEN-002). M0 runs a
 * single workspace in practice; the surface is multi-workspace-ready.
 */
@Injectable()
export class WorkspacesRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert a workspace (bootstrap; org explicit). */
  async create(data: { organizationId: string; name: string; slug: string }): Promise<Workspace> {
    const [row] = await this.db
      .insert(workspaces)
      .values({ organizationId: data.organizationId, name: data.name, slug: data.slug })
      .returning();
    if (!row) {
      throw new Error('failed to create workspace');
    }
    return row;
  }

  /** All workspaces in the current org (creation order). */
  async list(): Promise<Workspace[]> {
    return this.db
      .select()
      .from(workspaces)
      .where(this.orgScope(workspaces))
      .orderBy(asc(workspaces.id));
  }

  async findById(id: string): Promise<Workspace | null> {
    const [row] = await this.db
      .select()
      .from(workspaces)
      .where(this.scoped(workspaces, eq(workspaces.id, id)))
      .limit(1);
    return row ?? null;
  }
}
