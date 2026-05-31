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
import { VersionConflictError, WorkItemsRepository } from '../repositories/work-items.repository';
import { MoveWorkItemProvider } from './move-work-item.provider';

/**
 * Integration test against REAL PostgreSQL (T047, FR-VIEW-001, SC-005). Proves the board
 * move: fractional `position` between neighbours, optimistic `version` (stale → conflict),
 * STATUS_CHANGED + MOVED activity, and `completed_at` set on a move into a COMPLETED
 * status (cleared on the way out). Seed items #1/#2/#3 carry positions 1024/2048/3072.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

const ITEM_1 = '0193b3a0-0000-7000-8000-000000000020'; // To Do, position 1024
const ITEM_2 = '0193b3a0-0000-7000-8000-000000000021'; // In Progress, position 2048
const ITEM_3 = '0193b3a0-0000-7000-8000-000000000022'; // To Do, position 3072

describe('MoveWorkItemProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: MoveWorkItemProvider;
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
    provider = new MoveWorkItemProvider(repo, access, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  async function versionOf(id: string): Promise<number> {
    const r = await tenant.run(CTX, () => repo.findById(id));
    return r?.item.version ?? -1;
  }

  it('places a card between two neighbours (fractional position = midpoint)', async () => {
    // Move item #2 between #1 (1024) and #3 (3072) → midpoint 2048.
    const v = await versionOf(ITEM_2);
    const res = await tenant.run(CTX, () =>
      provider.move(ITEM_2, { version: v, afterId: ITEM_1, beforeId: ITEM_3 }),
    );
    expect(res.item.position).toBe('2048');
    expect(res.item.version).toBe(v + 1);

    const log = await tenant.run(CTX, () => activityRepo.listForItem(ITEM_2));
    expect(log.some((e) => e.action === 'MOVED')).toBe(true);
  });

  it('places a card after a single neighbour (position = neighbour + step)', async () => {
    const v = await versionOf(ITEM_3);
    const res = await tenant.run(CTX, () => provider.move(ITEM_3, { version: v, afterId: ITEM_1 }));
    // ITEM_1 stays at 1024 → after it = 1024 + 1024 = 2048.
    expect(res.item.position).toBe('2048');
  });

  it('changes status and logs a STATUS_CHANGED activity entry', async () => {
    const v = await versionOf(ITEM_1);
    const res = await tenant.run(CTX, () =>
      provider.move(ITEM_1, { version: v, statusId: SEED_STATUS_IDS.inProgress }),
    );
    expect(res.item.statusId).toBe(SEED_STATUS_IDS.inProgress);

    const log = await tenant.run(CTX, () => activityRepo.listForItem(ITEM_1));
    expect(log.some((e) => e.action === 'STATUS_CHANGED')).toBe(true);
  });

  it('sets completed_at on a move into a COMPLETED-category status and clears it on the way out', async () => {
    const vIn = await versionOf(ITEM_1);
    const done = await tenant.run(CTX, () =>
      provider.move(ITEM_1, { version: vIn, statusId: SEED_STATUS_IDS.done }),
    );
    expect(done.item.statusId).toBe(SEED_STATUS_IDS.done);
    expect(done.item.completedAt).not.toBeNull();

    const vOut = await versionOf(ITEM_1);
    const reopened = await tenant.run(CTX, () =>
      provider.move(ITEM_1, { version: vOut, statusId: SEED_STATUS_IDS.todo }),
    );
    expect(reopened.item.completedAt).toBeNull();
  });

  it('rejects a stale version with a VersionConflictError (→ 409)', async () => {
    const v = await versionOf(ITEM_2);
    await expect(
      tenant.run(CTX, () => provider.move(ITEM_2, { version: v + 99, afterId: ITEM_1 })),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });
});
