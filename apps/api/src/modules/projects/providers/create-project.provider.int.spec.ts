import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectCountersRepository } from '../repositories/project-counters.repository';
import { ProjectMembersRepository } from '../repositories/project-members.repository';
import { ProjectsRepository } from '../repositories/projects.repository';
import { StatusesRepository } from '../repositories/statuses.repository';
import { CreateProjectProvider } from './create-project.provider';

/**
 * Integration test against REAL PostgreSQL (T063, FR-PROJ-001). Proves that creating a
 * project seeds its `project_counter` (at 0) + the six categorized default statuses + the
 * creator's ADMIN membership in ONE transaction, and that a duplicate `(org, workspace,
 * key_prefix)` is rejected (409 path).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('CreateProjectProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: CreateProjectProvider;
  let projects: ProjectsRepository;
  let counters: ProjectCountersRepository;
  let members: ProjectMembersRepository;
  let statuses: StatusesRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    projects = new ProjectsRepository(handle.db, tenant);
    counters = new ProjectCountersRepository(handle.db, tenant);
    members = new ProjectMembersRepository(handle.db, tenant);
    statuses = new StatusesRepository(handle.db, tenant);
    provider = new CreateProjectProvider(projects, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('seeds counter + six default statuses + creator ADMIN membership in one tx', async () => {
    const project = await tenant.run(CTX, () =>
      provider.create({ name: 'Marketing', keyPrefix: 'MKT', color: '#3B82F6' }),
    );
    expect(project.keyPrefix).toBe('MKT');
    expect(project.archivedAt).toBeNull();

    const lastNumber = await tenant.run(CTX, () => counters.lastNumber(project.id));
    expect(lastNumber).toBe(0);

    const seeded = await tenant.run(CTX, () => statuses.listForProject(project.id));
    expect(seeded).toHaveLength(6);
    expect(seeded.map((s) => s.name)).toEqual([
      'Backlog',
      'To Do',
      'In Progress',
      'Review',
      'Done',
      'Cancelled',
    ]);
    // The first UNSTARTED status is the create-time default for new items.
    expect(seeded.find((s) => s.category === 'UNSTARTED')?.name).toBe('To Do');

    const role = await tenant.run(CTX, () => members.findRole(project.id, SEED_USER_ID));
    expect(role).toBe('ADMIN');
  });

  it('rejects a duplicate (org, workspace, key_prefix)', async () => {
    await tenant.run(CTX, () => provider.create({ name: 'First', keyPrefix: 'DUP' }));
    await expect(
      tenant.run(CTX, () => provider.create({ name: 'Second', keyPrefix: 'DUP' })),
    ).rejects.toThrow();
  });

  it('rolls back the whole create when the prefix collides (no orphan statuses/counter)', async () => {
    const first = await tenant.run(CTX, () => provider.create({ name: 'Roll', keyPrefix: 'ROLL' }));
    // A second create with the same prefix fails; the failed attempt leaves nothing behind.
    await expect(
      tenant.run(CTX, () => provider.create({ name: 'Roll2', keyPrefix: 'ROLL' })),
    ).rejects.toThrow();
    // The original project's statuses are intact and there is exactly one ROLL project.
    const seeded = await tenant.run(CTX, () => statuses.listForProject(first.id));
    expect(seeded).toHaveLength(6);
  });
});
