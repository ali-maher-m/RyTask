import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  comments,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../repositories/activity.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { DeleteRestoreWorkItemProvider } from './delete-restore-work-item.provider';

/**
 * Integration test against REAL PostgreSQL (T032, FR-WI-008). Soft delete hides the item
 * from default reads; restore returns it with comments + history intact.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('DeleteRestoreWorkItemProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: DeleteRestoreWorkItemProvider;
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
    provider = new DeleteRestoreWorkItemProvider(repo, access, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  async function newItem(): Promise<string> {
    const created = await tenant.run(CTX, () =>
      repo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'Trash me',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        reporterId: SEED_USER_ID,
      }),
    );
    return created.item.id;
  }

  it('soft delete hides the item from default reads', async () => {
    const id = await newItem();
    await tenant.run(CTX, () => provider.delete(id));
    expect(await tenant.run(CTX, () => repo.findById(id))).toBeNull();
    // The row still exists (soft delete) and is recoverable.
    expect(await tenant.run(CTX, () => repo.findByIdIncludingDeleted(id))).not.toBeNull();
  });

  it('restore returns the item + its comments + history intact', async () => {
    const id = await newItem();
    // A comment exists on the item before deletion.
    await handle.db.insert(comments).values({
      organizationId: SEED_ORG_ID,
      workItemId: id,
      authorId: SEED_USER_ID,
      body: 'keep me through delete/restore',
    });

    await tenant.run(CTX, () => provider.delete(id));
    const restored = await tenant.run(CTX, () => provider.restore(id));
    expect(restored.item.id).toBe(id);
    expect(restored.item.deletedAt).toBeNull();
    expect(await tenant.run(CTX, () => repo.findById(id))).not.toBeNull();

    // Comments survived (never hard-deleted).
    const remaining = await handle.db
      .select()
      .from(comments)
      .where(and(eq(comments.organizationId, SEED_ORG_ID), eq(comments.workItemId, id)));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.body).toBe('keep me through delete/restore');

    // History records DELETED then RESTORED (alongside CREATED).
    const log = await tenant.run(CTX, () => activityRepo.listForItem(id));
    const actions = log.map((r) => r.action);
    expect(actions).toContain('CREATED');
    expect(actions).toContain('DELETED');
    expect(actions).toContain('RESTORED');
  });

  it('restoring an item that is not deleted is a no-op that still returns it', async () => {
    const id = await newItem();
    const res = await tenant.run(CTX, () => provider.restore(id));
    expect(res.item.id).toBe(id);
    expect(res.item.deletedAt).toBeNull();
  });

  it('promotes a trashed parent’s live children up a level (no dangling parent, FR-HIER-001)', async () => {
    const parentId = await newItem();
    const child = await tenant.run(CTX, () =>
      repo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'Surviving child',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        reporterId: SEED_USER_ID,
        parentId,
      }),
    );

    await tenant.run(CTX, () => provider.delete(parentId));

    // The child is still live and no longer points at the trashed parent (promoted to root here).
    const fresh = await tenant.run(CTX, () => repo.findById(child.item.id));
    expect(fresh).not.toBeNull();
    expect(fresh?.item.parentId).toBeNull();
  });
});
