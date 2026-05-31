import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
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
import { ProjectMembersRepository } from './project-members.repository';
import { ProjectsRepository } from './projects.repository';

/**
 * Cross-tenant isolation for `projects` + `project_members` (T065, FR-TEN-003, SC-014).
 * Org A can never read/update/delete Org B's projects or memberships — enforced structurally
 * by TenantScopedRepository, proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000f1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000f2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000f3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000f4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000f5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('projects tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: ProjectsRepository;
  let members: ProjectMembersRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A: project RY, founder ADMIN member
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new ProjectsRepository(handle.db, tenant);
    members = new ProjectMembersRepository(handle.db, tenant);

    // Stand up a fully separate org B with one project + member.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-bp' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'wsp' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'bp@b.test', name: 'BP' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OBP',
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
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('an org reads only its own project by id', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(SEED_PROJECT_ID))).not.toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(PROJ_B))).not.toBeNull();
  });

  it('never reads another org’s project by id', async () => {
    expect(await tenant.run(ctxA, () => repo.findById(PROJ_B))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findById(SEED_PROJECT_ID))).toBeNull();
  });

  it('listForWorkspace never leaks across tenants', async () => {
    const a = await tenant.run(ctxA, () =>
      repo.listForWorkspace({ workspaceId: SEED_WORKSPACE_ID, limit: 50, includeArchived: true }),
    );
    expect(a.map((p) => p.id)).toContain(SEED_PROJECT_ID);
    expect(a.map((p) => p.id)).not.toContain(PROJ_B);

    // Org A asking for org B's workspace yields nothing (tenant predicate wins).
    const cross = await tenant.run(ctxA, () =>
      repo.listForWorkspace({ workspaceId: WS_B, limit: 50, includeArchived: true }),
    );
    expect(cross).toEqual([]);
  });

  it('update/delete cannot touch another org’s project', async () => {
    const updated = await tenant.run(ctxA, () => repo.update(PROJ_B, { name: 'Hacked' }));
    expect(updated).toBeNull();
    const deleted = await tenant.run(ctxA, () => repo.delete(PROJ_B));
    expect(deleted).toBe(false);
    // Org B's project is untouched.
    const stillThere = await tenant.run(ctxB, () => repo.findById(PROJ_B));
    expect(stillThere?.name).toBe('Bproj');
  });

  it('never leaks project_members across tenants', async () => {
    // Org A cannot see org B's membership role.
    expect(await tenant.run(ctxA, () => members.findRole(PROJ_B, USER_B))).toBeNull();
    // Org A's accessible projects never include org B's project.
    const aProjects = await tenant.run(ctxA, () => members.listProjectIdsForUser(SEED_USER_ID));
    expect(aProjects).toContain(SEED_PROJECT_ID);
    expect(aProjects).not.toContain(PROJ_B);
    // Org A listing org B's project members yields nothing.
    expect(await tenant.run(ctxA, () => members.listForProject(PROJ_B))).toEqual([]);
  });
});
