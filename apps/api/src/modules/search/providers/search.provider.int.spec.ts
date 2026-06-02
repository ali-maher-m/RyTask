import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  comments,
  createDb,
  labels,
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
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { SearchRepository } from '../repositories/search.repository';
import { SearchProvider } from './search.provider';

/**
 * Integration test against REAL PostgreSQL (T116, FR-SRCH-001/004, SC-009/014). Proves the
 * search provider returns RANKED matches across work-item titles/descriptions, comments,
 * projects, labels, and users — and that results NEVER include a project the principal is
 * not a member of, nor any other org's rows. Uses the seeded org (founder = ADMIN of
 * SEED_PROJECT), a second project in the same org the founder is NOT a member of, and a
 * fully separate org B.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

// A second project in the SAME org that the founder is NOT a member of.
const SECRET_PROJ = '0193b3a0-0000-7000-8000-0000000000a1';
const SECRET_STATUS = '0193b3a0-0000-7000-8000-0000000000a2';
// A second, fully separate org B with its own matching rows.
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000b2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000b3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000b4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000b5';

const UNIQUE = 'zephyrium'; // a rare token so FTS/ILIKE hits are unambiguous

describe('SearchProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: SearchProvider;
  let workItems: WorkItemsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A: founder is ADMIN of SEED_PROJECT
    handle = createDb(pg.url);
    tenant = new TenantContextService();

    workItems = new WorkItemsRepository(handle.db, tenant);
    const searchRepo = new SearchRepository(handle.db, tenant);
    const members = new ProjectMembersRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(members, tenant);
    const workItemAccess = new WorkItemAccessServiceImpl(
      workItems,
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    provider = new SearchProvider(searchRepo, access, tenant, workItemAccess);

    // ── accessible work item in SEED_PROJECT: title + description FTS hits ───────────
    const accessible = await tenant.run(CTX, () =>
      workItems.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: `Ship the ${UNIQUE} milestone`,
        description: `The ${UNIQUE} rollout plan.`,
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        reporterId: SEED_USER_ID,
      }),
    );
    // A comment on that item → comment FTS hit (search_vector on comments.body).
    await handle.db.insert(comments).values({
      organizationId: SEED_ORG_ID,
      workItemId: accessible.item.id,
      authorId: SEED_USER_ID,
      body: `Discussing the ${UNIQUE} approach in detail.`,
    });
    // A project + label + user that ILIKE-match the term (same org, accessible).
    await handle.db
      .update(projects)
      .set({ description: `Houses the ${UNIQUE} initiative.` })
      .where(eq(projects.id, SEED_PROJECT_ID));
    await handle.db.insert(labels).values({
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: `${UNIQUE}-label`,
    });
    await handle.db.insert(users).values({
      id: '0193b3a0-0000-7000-8000-0000000000a9',
      organizationId: SEED_ORG_ID,
      email: `${UNIQUE}@demo.test`,
      name: `${UNIQUE} Person`,
    });

    // ── inaccessible project in the SAME org (founder is NOT a member) ───────────────
    await handle.db.insert(projects).values({
      id: SECRET_PROJ,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: 'Secret',
      keyPrefix: 'SEC',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: SECRET_PROJ, organizationId: SEED_ORG_ID, lastNumber: 0 });
    await handle.db.insert(statuses).values({
      id: SECRET_STATUS,
      organizationId: SEED_ORG_ID,
      projectId: SECRET_PROJ,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await tenant.run(CTX, () =>
      workItems.createWorkItem({
        projectId: SECRET_PROJ,
        title: `Secret ${UNIQUE} work I cannot see`,
        statusId: SECRET_STATUS,
        priority: 'NONE',
      }),
    );

    // ── a fully separate org B with a matching item ─────────────────────────────────
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OB',
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
    await tenant.run({ organizationId: ORG_B, workspaceId: WS_B, userId: USER_B }, () =>
      workItems.createWorkItem({
        projectId: PROJ_B,
        title: `Other org ${UNIQUE} item`,
        statusId: STATUS_B,
        priority: 'NONE',
      }),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('returns ranked matches across items, comments, projects, labels, and users', async () => {
    const results = await tenant.run(CTX, () => provider.search({ q: UNIQUE, limit: 50 }));
    const types = new Set(results.map((r) => r.type));
    expect(types).toContain('work_item');
    expect(types).toContain('comment');
    expect(types).toContain('project');
    expect(types).toContain('label');
    expect(types).toContain('user');

    // The work-item FTS hit carries a positive ts_rank_cd (title weight A).
    const wi = results.find((r) => r.type === 'work_item');
    expect(wi?.title).toBe(`Ship the ${UNIQUE} milestone`);
    expect(wi?.rank).toBeGreaterThan(0);

    // FTS hits (rank > 0) sort above the constant-ranked ILIKE hits.
    expect(results[0]?.rank).toBeGreaterThan(0);
    const firstIlikeIdx = results.findIndex((r) => r.rank === 0);
    const lastFtsIdx = results.map((r) => r.rank > 0).lastIndexOf(true);
    if (firstIlikeIdx >= 0) {
      expect(lastFtsIdx).toBeLessThan(firstIlikeIdx);
    }
  });

  it('excludes items in a project the principal is not a member of (SC-009)', async () => {
    const results = await tenant.run(CTX, () => provider.search({ q: UNIQUE, limit: 50 }));
    expect(results.map((r) => r.title)).not.toContain(`Secret ${UNIQUE} work I cannot see`);
    expect(results.every((r) => r.projectId !== SECRET_PROJ)).toBe(true);
  });

  it("never returns another org's rows (SC-014)", async () => {
    const results = await tenant.run(CTX, () => provider.search({ q: UNIQUE, limit: 50 }));
    expect(results.map((r) => r.title)).not.toContain(`Other org ${UNIQUE} item`);
    expect(results.every((r) => r.projectId !== PROJ_B)).toBe(true);

    // And from org B's side, the founder's accessible matches are invisible.
    const fromB = await tenant.run(
      { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B },
      () => provider.search({ q: UNIQUE, limit: 50 }),
    );
    expect(fromB.map((r) => r.title)).not.toContain(`Ship the ${UNIQUE} milestone`);
    expect(fromB.map((r) => r.title)).toContain(`Other org ${UNIQUE} item`);
  });

  it('honours the ?types filter (restricts the result kinds)', async () => {
    const results = await tenant.run(CTX, () =>
      provider.search({ q: UNIQUE, types: 'project,label', limit: 50 }),
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.type === 'project' || r.type === 'label')).toBe(true);
  });

  it('returns nothing for a principal who can reach no projects (empty scope)', async () => {
    // A brand-new org-A user who is a member of no project.
    const loner = '0193b3a0-0000-7000-8000-0000000000af';
    await handle.db
      .insert(users)
      .values({ id: loner, organizationId: SEED_ORG_ID, email: 'loner@demo.test', name: 'Loner' });
    const results = await tenant.run(
      { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: loner },
      () => provider.search({ q: UNIQUE, types: 'work_item,comment', limit: 50 }),
    );
    expect(results).toEqual([]);
  });
});
