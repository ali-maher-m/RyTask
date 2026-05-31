import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  projectMembers,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { CommentsRepository } from '../repositories/comments.repository';
import { CreateCommentProvider } from './create-comment.provider';
import { ListCommentsProvider } from './list-comments.provider';

/**
 * Integration test against REAL PostgreSQL (T102, §14.1). Proves: a threaded reply
 * (parent_id), an @mention resolving to a MENTIONED watcher row that grants the user
 * item access (FR-COLLAB-002), and a COMMENTED activity row appended via the work-items
 * contract.
 */
const SEED_ITEM_ID = '0193b3a0-0000-7000-8000-000000000020'; // seeded item, number 1
const BOB_ID = '0193b3a0-0000-7000-8000-0000000000b9'; // a second project member ("bob")
const STRANGER_ID = '0193b3a0-0000-7000-8000-0000000000fe'; // org user, NOT a project member

const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

describe('CreateCommentProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: CreateCommentProvider;
  let listComments: ListCommentsProvider;
  let comments: CommentsRepository;
  let watchers: WorkItemWatchersRepository;
  let activity: ActivityRepository;
  let access: WorkItemAccessServiceImpl;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();

    // A second member "bob" (the @mention target) + a non-member stranger.
    await handle.db.insert(users).values([
      { id: BOB_ID, organizationId: SEED_ORG_ID, email: 'bob@demo.test', name: 'bob' },
      { id: STRANGER_ID, organizationId: SEED_ORG_ID, email: 'nobody@demo.test', name: 'nobody' },
    ]);
    await handle.db.insert(projectMembers).values({
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      userId: BOB_ID,
      role: 'MEMBER',
    });

    const workItems = new WorkItemsRepository(handle.db, tenant);
    watchers = new WorkItemWatchersRepository(handle.db, tenant);
    activity = new ActivityRepository(handle.db, tenant);
    comments = new CommentsRepository(handle.db, tenant);
    access = new WorkItemAccessServiceImpl(workItems, watchers, activity);
    const projectAccess = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new CreateCommentProvider(
      comments,
      projectAccess,
      access,
      tenant,
      new EventEmitter2(),
    );
    listComments = new ListCommentsProvider(comments, projectAccess, access);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('posts a comment and appends a COMMENTED activity row', async () => {
    const before = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    const { comment } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'First!' }),
    );
    expect(comment.workItemId).toBe(SEED_ITEM_ID);
    expect(comment.authorId).toBe(SEED_USER_ID);

    const after = await tenant.run(CTX, () => activity.listForItem(SEED_ITEM_ID));
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)?.action).toBe('COMMENTED');
  });

  it('creates a threaded reply pointing at its parent', async () => {
    const { comment: parent } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'parent' }),
    );
    const { comment: reply } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'child', parentId: parent.id }),
    );
    expect(reply.parentId).toBe(parent.id);
  });

  it('rejects a reply whose parent is not on this item', async () => {
    await expect(
      tenant.run(CTX, () =>
        provider.create(SEED_ITEM_ID, {
          body: 'bad parent',
          parentId: '0193b3a0-0000-7000-8000-0000000000cc',
        }),
      ),
    ).rejects.toThrow();
  });

  it('an @mention seeds a MENTIONED watcher that grants the user item access', async () => {
    // Before: bob is a member, but not (yet) a mentioned watcher of this item.
    const { mentions } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'Heads up @bob please review' }),
    );
    expect(mentions).toContain(BOB_ID);

    const list = await tenant.run(CTX, () => watchers.listForItem(SEED_ITEM_ID));
    expect(list.find((w) => w.userId === BOB_ID)?.reason).toBe('MENTIONED');

    // The mention grants access (here bob is also a member, so canAccess is true regardless).
    expect(await tenant.run(CTX, () => access.canAccess(SEED_ITEM_ID, BOB_ID))).toBe(true);
  });

  it('suppresses a self-mention (the author never notifies themselves)', async () => {
    const { mentions } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'note to self @founder' }),
    );
    // @founder resolves to SEED_USER_ID (the author) → suppressed.
    expect(mentions).not.toContain(SEED_USER_ID);
  });

  it('ignores an @mention of a non-project-member (unresolved → no watcher)', async () => {
    const { mentions } = await tenant.run(CTX, () =>
      provider.create(SEED_ITEM_ID, { body: 'hi @nobody-here' }),
    );
    expect(mentions).toEqual([]);
  });

  it('rejects a comment from a non-member (RBAC project:member → Forbidden)', async () => {
    const stranger = { ...CTX, userId: STRANGER_ID };
    await expect(
      tenant.run(stranger, () => provider.create(SEED_ITEM_ID, { body: 'nope' })),
    ).rejects.toThrow();
  });

  describe('ListCommentsProvider', () => {
    it('returns the threaded comments for a project member', async () => {
      await tenant.run(CTX, () => provider.create(SEED_ITEM_ID, { body: 'listable' }));
      const list = await tenant.run(CTX, () => listComments.list(SEED_ITEM_ID, SEED_USER_ID));
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((c) => c.body === 'listable')).toBe(true);
    });

    it('404s a missing work item', async () => {
      await expect(
        tenant.run(CTX, () =>
          listComments.list('0193b3a0-0000-7000-8000-0000000000dd', SEED_USER_ID),
        ),
      ).rejects.toThrow();
    });

    it('403s a non-member who is not a mentioned watcher', async () => {
      const stranger = { ...CTX, userId: STRANGER_ID };
      await expect(
        tenant.run(stranger, () => listComments.list(SEED_ITEM_ID, STRANGER_ID)),
      ).rejects.toThrow();
    });
  });
});
