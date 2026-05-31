import { Inject, Injectable } from '@nestjs/common';
import { type Database, projectCounters } from '@rytask/db';
import { eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/**
 * Tenant-scoped writes over `project_counters` (data-model §2.3, research D1). One row per
 * project, seeded at `last_number = 0` when the project is created (in the create-project
 * tx). The atomic key mint (`UPDATE … last_number + 1 RETURNING`) lives in the work-items
 * repository — this repo only seeds/inspects the row.
 */
@Injectable()
export class ProjectCountersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Seed the per-project key counter at 0 (idempotent). Tenant-scoped. */
  async seed(projectId: string): Promise<void> {
    await this.db
      .insert(projectCounters)
      .values({ projectId, organizationId: this.tenant.getOrgId(), lastNumber: 0 })
      .onConflictDoNothing();
  }

  /** The current `last_number` for a project (tenant-scoped), or null if there is no row. */
  async lastNumber(projectId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ lastNumber: projectCounters.lastNumber })
      .from(projectCounters)
      .where(this.scoped(projectCounters, eq(projectCounters.projectId, projectId)))
      .limit(1);
    return row?.lastNumber ?? null;
  }
}
