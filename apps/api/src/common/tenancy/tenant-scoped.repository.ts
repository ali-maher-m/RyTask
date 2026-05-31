import type { Database } from '@rytask/db';
import { type SQL, and, eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { TenantContextService } from './tenant-context.service';

/** Any tenant-scoped table exposes an `organizationId` column (ARCHITECTURE §4.2). */
export interface TenantScopedTable {
  organizationId: PgColumn;
}

/**
 * Base class for every tenant-scoped repository. It centralizes the mandatory
 * `WHERE organization_id = :orgId` filter so isolation is structural, not a matter
 * of developer discipline (§4.2 defense-in-depth). Raw, unscoped Drizzle access from
 * outside repositories is forbidden by the architecture-boundary lint.
 */
export abstract class TenantScopedRepository {
  // Public so subclasses that don't declare their own constructor inherit it.
  // Concrete @Injectable repos normally declare a constructor with @Inject(DB).
  constructor(
    protected readonly db: Database,
    protected readonly tenant: TenantContextService,
  ) {}

  /** The mandatory tenant predicate: `organization_id = :orgId`. */
  protected orgScope(table: TenantScopedTable): SQL {
    return eq(table.organizationId, this.tenant.getOrgId());
  }

  /** Combine the tenant predicate with extra conditions (tenant filter always applied). */
  protected scoped(table: TenantScopedTable, ...extra: Array<SQL | undefined>): SQL {
    return and(this.orgScope(table), ...extra) as SQL;
  }
}
