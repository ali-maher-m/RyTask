import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workspaces,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { CommentsRepository } from './comments.repository';

/**
 * Cross-tenant isolation for `comments` + `work_item_watchers` (T105, FR-TEN-003,
 * SC-014). Org A can never read/write Org B's comments or watcher rows — enforced
 * structurally by TenantScopedRepository, proven against real Postgres. Mirrors
 * work-items/repositories/work-items.tenancy.spec.ts.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000d2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000d4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000d5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('comments tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let commentsRepo: CommentsRepository;
  let watchersRepo: WorkItemWatchersRepository;
  let wiRepo: WorkItemsRepository;
  let itemAId: string;
  let itemBId: string;
  let commentAId: string;
  let commentBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    commentsRepo = new CommentsRepository(handle.db, tenant);
    watchersRepo = new WorkItemWatchersRepository(handle.db, tenant);
    wiRepo = new WorkItemsRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-cmt' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-cmt' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@cmt.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OBC',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJ_B, organizationId: ORG_B, lastNumber: 0 });
    await handle.db.insert(statuses).values({
      id: STATUS_B,
      organizationId: ORG_B,
      projectId: PROJ_B,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await handle.db
      .insert(projectMembers)
      .values({ organizationId: ORG_B, projectId: PROJ_B, userId: USER_B, role: 'ADMIN' });

    const a = await tenant.run(ctxA, () =>
      wiRepo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'A',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
      }),
    );
    const b = await tenant.run(ctxB, () =>
      wiRepo.createWorkItem({
        projectId: PROJ_B,
        title: 'B',
        statusId: STATUS_B,
        priority: 'NONE',
      }),
    );
    itemAId = a.item.id;
    itemBId = b.item.id;

    const ca = await tenant.run(ctxA, () =>
      commentsRepo.create({ workItemId: itemAId, authorId: SEED_USER_ID, body: 'A comment' }),
    );
    const cb = await tenant.run(ctxB, () =>
      commentsRepo.create({ workItemId: itemBId, authorId: USER_B, body: 'B comment' }),
    );
    commentAId = ca.id;
    commentBId = cb.id;

    await tenant.run(ctxA, () => watchersRepo.addMentioned(itemAId, [SEED_USER_ID]));
    await tenant.run(ctxB, () => watchersRepo.addMentioned(itemBId, [USER_B]));
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org reads only its own comments', async () => {
    expect(await tenant.run(ctxA, () => commentsRepo.findById(commentAId))).not.toBeNull();
    expect(await tenant.run(ctxB, () => commentsRepo.findById(commentBId))).not.toBeNull();
  });

  it('never resolves another org’s comment by id', async () => {
    expect(await tenant.run(ctxA, () => commentsRepo.findById(commentBId))).toBeNull();
    expect(await tenant.run(ctxB, () => commentsRepo.findById(commentAId))).toBeNull();
  });

  it('never leaks a comment thread across tenants', async () => {
    expect(await tenant.run(ctxA, () => commentsRepo.listForItem(itemBId))).toHaveLength(0);
    expect(await tenant.run(ctxB, () => commentsRepo.listForItem(itemAId))).toHaveLength(0);
  });

  it('never leaks work_item_watchers across tenants', async () => {
    expect(await tenant.run(ctxA, () => watchersRepo.listForItem(itemBId))).toHaveLength(0);
    expect(await tenant.run(ctxB, () => watchersRepo.listForItem(itemAId))).toHaveLength(0);
    // And cross-org membership / mention checks are scoped too.
    expect(await tenant.run(ctxA, () => watchersRepo.isMentionedWatcher(itemBId, USER_B))).toBe(
      false,
    );
  });
});
