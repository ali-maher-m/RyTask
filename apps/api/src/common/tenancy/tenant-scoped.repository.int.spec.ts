import { type DbHandle, createDb, organizations, runMigrations, users } from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type StartedPostgres, startPostgres } from '../testing/postgres';
import { TenantContextService } from './tenant-context.service';
import { TenantScopedRepository } from './tenant-scoped.repository';

/**
 * Cross-tenant isolation test (FR-TEN-001, §14.2). Proves that a repository built on
 * TenantScopedRepository can NEVER read another org's rows — isolation is structural,
 * enforced by the base class, not by the caller remembering to filter. Real Postgres.
 */
class UsersRepo extends TenantScopedRepository {
  async listEmails(): Promise<Array<{ email: string; organizationId: string }>> {
    return this.db
      .select({ email: users.email, organizationId: users.organizationId })
      .from(users)
      .where(this.orgScope(users));
  }
}

const ORG_A = '0193b3a0-0000-7000-8000-0000000000a1';
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b1';

describe('TenantScopedRepository (tenant isolation)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: UsersRepo;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new UsersRepo(handle.db, tenant);

    await handle.db.insert(organizations).values([
      { id: ORG_A, name: 'Org A', slug: 'org-a' },
      { id: ORG_B, name: 'Org B', slug: 'org-b' },
    ]);
    await handle.db.insert(users).values([
      { organizationId: ORG_A, email: 'a1@a.test', name: 'A One' },
      { organizationId: ORG_A, email: 'a2@a.test', name: 'A Two' },
      { organizationId: ORG_B, email: 'b1@b.test', name: 'B One' },
    ]);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('returns only the current org rows and never leaks across tenants', async () => {
    const orgA = await tenant.run({ organizationId: ORG_A }, () => repo.listEmails());
    expect(orgA).toHaveLength(2);
    expect(orgA.every((r) => r.organizationId === ORG_A)).toBe(true);

    const orgB = await tenant.run({ organizationId: ORG_B }, () => repo.listEmails());
    expect(orgB).toHaveLength(1);
    expect(orgB[0]?.email).toBe('b1@b.test');
  });

  it('rejects when no tenant context is established', async () => {
    // orgScope() reads the context while building the query; no context → no query.
    await expect(repo.listEmails()).rejects.toThrow(/tenant context/i);
  });
});
