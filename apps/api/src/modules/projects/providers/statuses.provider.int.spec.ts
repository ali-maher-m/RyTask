import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { ProjectMembersRepository } from '../repositories/project-members.repository';
import { StatusesRepository } from '../repositories/statuses.repository';
import { ProjectAccessServiceImpl } from '../services/project-access.service';
import { StatusesProvider } from './statuses.provider';

/**
 * Integration test against REAL PostgreSQL (T048, FR-WF-001/002). Exercises the statuses
 * provider end-to-end: create/update/reorder/list and the delete-with-remap (items
 * re-pointed in one tx; min-one + reassign rules). The seed founder is a project ADMIN.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('StatusesProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: StatusesProvider;
  let statusesRepo: StatusesRepository;
  let workItemsRepo: WorkItemsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    statusesRepo = new StatusesRepository(handle.db, tenant);
    workItemsRepo = new WorkItemsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new StatusesProvider(statusesRepo, access);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists the six seeded statuses in board order', async () => {
    const list = await tenant.run(CTX, () => provider.list(SEED_PROJECT_ID));
    expect(list).toHaveLength(6);
    expect(list[0]?.name).toBe('Backlog');
    expect(list.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('creates a status appended at the end of the board', async () => {
    const created = await tenant.run(CTX, () =>
      provider.create(SEED_PROJECT_ID, { name: 'Blocked', category: 'STARTED', color: '#EF4444' }),
    );
    expect(created.name).toBe('Blocked');
    expect(created.category).toBe('STARTED');
    expect(created.position).toBe(6); // max(0..5) + 1
  });

  it('updates a status name/category/color', async () => {
    const updated = await tenant.run(CTX, () =>
      provider.update(SEED_STATUS_IDS.review, { name: 'In Review', color: '#7C3AED' }),
    );
    expect(updated.name).toBe('In Review');
    expect(updated.color).toBe('#7C3AED');
  });

  it('reorders the project statuses by the given total ordering', async () => {
    const current = await tenant.run(CTX, () => provider.list(SEED_PROJECT_ID));
    const reversed = [...current].reverse().map((s) => s.id);
    const after = await tenant.run(CTX, () =>
      provider.reorder(SEED_PROJECT_ID, { orderedIds: reversed }),
    );
    expect(after.map((s) => s.id)).toEqual(reversed);
    expect(after.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('rejects a reorder that does not cover every status exactly once', async () => {
    await expect(
      tenant.run(CTX, () =>
        provider.reorder(SEED_PROJECT_ID, { orderedIds: [SEED_STATUS_IDS.todo] }),
      ),
    ).rejects.toThrow();
  });

  it('refuses to delete a status that has items without reassignTo (409)', async () => {
    // Seed put item #1 + #3 in To Do, so it is non-empty.
    await expect(
      tenant.run(CTX, () => provider.delete(SEED_STATUS_IDS.todo, null)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('deletes a status with items by re-mapping them to reassignTo (one tx)', async () => {
    const itemsBefore = await tenant.run(CTX, () => statusesRepo.itemCount(SEED_STATUS_IDS.todo));
    expect(itemsBefore).toBeGreaterThan(0);

    await tenant.run(CTX, () => provider.delete(SEED_STATUS_IDS.todo, SEED_STATUS_IDS.backlog));

    // The status is gone…
    expect(await tenant.run(CTX, () => statusesRepo.findById(SEED_STATUS_IDS.todo))).toBeNull();
    // …and its items were re-pointed to Backlog (none left orphaned on the deleted status).
    expect(await tenant.run(CTX, () => statusesRepo.itemCount(SEED_STATUS_IDS.todo))).toBe(0);
    expect(await tenant.run(CTX, () => statusesRepo.itemCount(SEED_STATUS_IDS.backlog))).toBe(
      itemsBefore,
    );
    // The moved item still exists and now references Backlog.
    const moved = await tenant.run(CTX, () =>
      workItemsRepo.findById('0193b3a0-0000-7000-8000-000000000020'),
    );
    expect(moved?.item.statusId).toBe(SEED_STATUS_IDS.backlog);
  });

  it('refuses to delete the last remaining status (min-one)', async () => {
    // Delete down to a single status, then attempt the final delete.
    const list = await tenant.run(CTX, () => provider.list(SEED_PROJECT_ID));
    const keep = list[0];
    const remap = keep?.id ?? null;
    for (const s of list.slice(1)) {
      await tenant.run(CTX, () => provider.delete(s.id, remap));
    }
    const remaining = await tenant.run(CTX, () => provider.list(SEED_PROJECT_ID));
    expect(remaining).toHaveLength(1);
    await expect(
      tenant.run(CTX, () => provider.delete(remaining[0]?.id as string, null)),
    ).rejects.toMatchObject({ status: 409 });
  });
});
