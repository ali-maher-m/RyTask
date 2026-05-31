import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { ListWorkItemsProvider } from './list-work-items.provider';
import { MyWorkProvider } from './my-work.provider';

/**
 * Integration test against REAL PostgreSQL (T064, FR-PROJ-002). "My Work" lists every item
 * assigned to the principal across the projects they can access — and NEVER items in a project
 * the principal is not a member of. The query logic is the shared list path; this asserts the
 * cross-project assignee=me + accessible-projects intersection end-to-end.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const clock: Clock = { now: () => new Date('2026-05-31T12:00:00.000Z') };

// A second project in the same org/workspace that the principal is NOT a member of.
const PROJ_2 = '0193b3a0-0000-7000-8000-0000000000c1';
const PROJ_2_STATUS = '0193b3a0-0000-7000-8000-0000000000c2';
// A third project the principal IS a member of (to prove cross-project aggregation).
const PROJ_3 = '0193b3a0-0000-7000-8000-0000000000c3';
const PROJ_3_STATUS = '0193b3a0-0000-7000-8000-0000000000c4';
const OTHER_USER = '0193b3a0-0000-7000-8000-0000000000c5';

describe('MyWorkProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: MyWorkProvider;
  let workItems: WorkItemsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // SEED_PROJECT (founder is ADMIN), 3 items (#1, #2 assigned to founder)
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    workItems = new WorkItemsRepository(handle.db, tenant);
    const members = new ProjectMembersRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(members, tenant);
    const list = new ListWorkItemsProvider(workItems, access, clock, tenant);
    provider = new MyWorkProvider(list);

    await handle.db.insert(users).values({
      id: OTHER_USER,
      organizationId: SEED_ORG_ID,
      email: 'other@rytask.local',
      name: 'Other',
    });

    // PROJ_2: principal is NOT a member; an item here is assigned to the founder but must be
    // invisible to My Work (no membership → not accessible).
    await handle.db.insert(projects).values({
      id: PROJ_2,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: 'Secret',
      keyPrefix: 'SEC',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJ_2, organizationId: SEED_ORG_ID, lastNumber: 0 });
    await handle.db.insert(statuses).values({
      id: PROJ_2_STATUS,
      organizationId: SEED_ORG_ID,
      projectId: PROJ_2,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });

    // PROJ_3: principal IS a member; an item here assigned to the founder must appear.
    await handle.db.insert(projects).values({
      id: PROJ_3,
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      name: 'Shared',
      keyPrefix: 'SHR',
    });
    await handle.db
      .insert(projectCounters)
      .values({ projectId: PROJ_3, organizationId: SEED_ORG_ID, lastNumber: 0 });
    await handle.db.insert(statuses).values({
      id: PROJ_3_STATUS,
      organizationId: SEED_ORG_ID,
      projectId: PROJ_3,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 0,
    });
    await handle.db.insert(projectMembers).values({
      organizationId: SEED_ORG_ID,
      projectId: PROJ_3,
      userId: SEED_USER_ID,
      role: 'MEMBER',
    });

    // Item in PROJ_2 (inaccessible) assigned to the founder.
    await tenant.run(CTX, () =>
      workItems.createWorkItem({
        projectId: PROJ_2,
        title: 'In a project I cannot see',
        statusId: PROJ_2_STATUS,
        priority: 'NONE',
        assigneeId: SEED_USER_ID,
      }),
    );
    // Item in PROJ_3 (accessible) assigned to the founder → should appear in My Work.
    await tenant.run(CTX, () =>
      workItems.createWorkItem({
        projectId: PROJ_3,
        title: 'Cross-project assigned to me',
        statusId: PROJ_3_STATUS,
        priority: 'NONE',
        assigneeId: SEED_USER_ID,
      }),
    );
    // Item in SEED_PROJECT assigned to OTHER → must NOT appear in the founder's My Work.
    await tenant.run(CTX, () =>
      workItems.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'Assigned to someone else',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        assigneeId: OTHER_USER,
      }),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists items assigned to me across accessible projects', async () => {
    const res = await tenant.run(CTX, () => provider.myWork({ limit: 50 }));
    const titles = res.data.map((d) => d.title);
    // Seeded items #1, #2 (SEED_PROJECT, founder-assigned) + the PROJ_3 item.
    expect(titles).toContain('Set up the project board');
    expect(titles).toContain('Capture work in seconds with quick-add');
    expect(titles).toContain('Cross-project assigned to me');
  });

  it('excludes items in a project the principal is not a member of (FR-PROJ-002)', async () => {
    const res = await tenant.run(CTX, () => provider.myWork({ limit: 50 }));
    const titles = res.data.map((d) => d.title);
    expect(titles).not.toContain('In a project I cannot see');
    expect(res.data.every((d) => d.projectId !== PROJ_2)).toBe(true);
  });

  it('excludes items assigned to someone else', async () => {
    const res = await tenant.run(CTX, () => provider.myWork({ limit: 50 }));
    expect(res.data.map((d) => d.title)).not.toContain('Assigned to someone else');
    // Every returned item is assigned to the principal.
    expect(res.data.every((d) => d.assigneeId === SEED_USER_ID)).toBe(true);
  });

  it('a non-member sees none of a project’s items (empty My Work)', async () => {
    const strangerCtx = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: OTHER_USER,
    };
    const res = await tenant.run(strangerCtx, () => provider.myWork({ limit: 50 }));
    // OTHER_USER is a member of no project → no accessible projects → empty.
    expect(res.data).toEqual([]);
  });
});
