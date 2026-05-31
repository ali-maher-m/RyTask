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
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../repositories/activity.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { UpdateWorkItemProvider } from './update-work-item.provider';

/**
 * Integration test against REAL PostgreSQL (T031, §14.1). Proves the edit path: each
 * field persists, one activity row per changed field is appended, optimistic `version`
 * mismatch conflicts, and the completed_at rule fires on COMPLETED-category transitions.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('UpdateWorkItemProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: UpdateWorkItemProvider;
  let repo: WorkItemsRepository;
  let activityRepo: ActivityRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new WorkItemsRepository(handle.db, tenant);
    activityRepo = new ActivityRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new UpdateWorkItemProvider(repo, access, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  async function newItem(): Promise<{ id: string; version: number }> {
    const created = await tenant.run(CTX, () =>
      repo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'Editable item',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        reporterId: SEED_USER_ID,
      }),
    );
    return { id: created.item.id, version: created.item.version };
  }

  it('persists each edited field and bumps version', async () => {
    const { id, version } = await newItem();
    const res = await tenant.run(CTX, () =>
      provider.update(id, {
        version,
        title: 'Renamed',
        description: 'A **markdown** description',
        priority: 'HIGH',
        assigneeId: SEED_USER_ID,
        estimateValue: 5,
        dueDate: '2026-08-01',
        startDate: '2026-07-01',
        endDate: '2026-07-15',
      }),
    );
    expect(res.item.title).toBe('Renamed');
    expect(res.item.description).toBe('A **markdown** description');
    expect(res.item.priority).toBe('HIGH');
    expect(res.item.assigneeId).toBe(SEED_USER_ID);
    expect(Number(res.item.estimateValue)).toBe(5);
    expect(res.item.dueDate).toBe('2026-08-01');
    expect(res.item.startDate).toBe('2026-07-01');
    expect(res.item.endDate).toBe('2026-07-15');
    expect(res.item.version).toBe(version + 1);
  });

  it('appends one activity row per changed field, none for no-op edits', async () => {
    const { id, version } = await newItem();
    await tenant.run(CTX, () => provider.update(id, { version, title: 'Two', priority: 'LOW' }));
    let log = await tenant.run(CTX, () => activityRepo.listForItem(id));
    // CREATED + UPDATED(title) + UPDATED(priority)
    const updates = log.filter((r) => r.action === 'UPDATED');
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.field).sort()).toEqual(['priority', 'title']);

    // No-op edit (same values) → no new rows.
    const fresh = await tenant.run(CTX, () => repo.findById(id));
    await tenant.run(CTX, () =>
      provider.update(id, { version: fresh?.item.version ?? 1, title: 'Two', priority: 'LOW' }),
    );
    log = await tenant.run(CTX, () => activityRepo.listForItem(id));
    expect(log.filter((r) => r.action === 'UPDATED')).toHaveLength(2);
  });

  it('rejects a stale optimistic version (conflict)', async () => {
    const { id, version } = await newItem();
    await tenant.run(CTX, () => provider.update(id, { version, title: 'first write' }));
    // Reusing the now-stale version must conflict.
    await expect(
      tenant.run(CTX, () => provider.update(id, { version, title: 'stale write' })),
    ).rejects.toMatchObject({ name: 'VersionConflictError' });
  });

  it('sets completed_at moving to a COMPLETED status and clears it moving out', async () => {
    const { id, version } = await newItem();
    const done = await tenant.run(CTX, () =>
      provider.update(id, { version, statusId: SEED_STATUS_IDS.done }),
    );
    expect(done.item.statusId).toBe(SEED_STATUS_IDS.done);
    expect(done.item.completedAt).not.toBeNull();
    const log = await tenant.run(CTX, () => activityRepo.listForItem(id));
    expect(log.some((r) => r.action === 'STATUS_CHANGED')).toBe(true);

    const reopened = await tenant.run(CTX, () =>
      provider.update(id, { version: done.item.version, statusId: SEED_STATUS_IDS.inProgress }),
    );
    expect(reopened.item.completedAt).toBeNull();
  });

  it('rejects an inverted start/end range (400)', async () => {
    const { id, version } = await newItem();
    await expect(
      tenant.run(CTX, () =>
        provider.update(id, { version, startDate: '2026-09-10', endDate: '2026-09-01' }),
      ),
    ).rejects.toThrow();
  });
});
