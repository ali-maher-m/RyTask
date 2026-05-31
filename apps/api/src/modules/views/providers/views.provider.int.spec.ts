import { ForbiddenException } from '@nestjs/common';
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
import { ViewsRepository } from '../repositories/views.repository';
import { DeleteViewProvider } from './delete-view.provider';
import { ListViewsProvider } from './list-views.provider';
import { SaveViewProvider } from './save-view.provider';
import { UpdateViewProvider } from './update-view.provider';

/**
 * Saved-views CRUD + visibility against REAL PostgreSQL (T078, FR-VIEW-008). Proves the
 * personal/shared rule end-to-end: a PERSONAL view is visible only to its owner; a SHARED
 * project view is visible to project members; neither leaks to a non-member.
 */
const OWNER = SEED_USER_ID; // ADMIN of SEED_PROJECT (seed)
const MEMBER = '0193b3a0-0000-7000-8000-0000000d0001'; // a second project member
const STRANGER = '0193b3a0-0000-7000-8000-0000000d0002'; // not a member of the project

const ctx = (userId: string) => ({
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId,
});

describe('ViewsProviders (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let save: SaveViewProvider;
  let list: ListViewsProvider;
  let update: UpdateViewProvider;
  let del: DeleteViewProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const repo = new ViewsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    save = new SaveViewProvider(repo, access, tenant);
    list = new ListViewsProvider(repo, access, tenant);
    update = new UpdateViewProvider(repo, access, tenant);
    del = new DeleteViewProvider(repo, access, tenant);

    // A second member of the seeded project + a stranger in the same org.
    await handle.db.insert(users).values([
      { id: MEMBER, organizationId: SEED_ORG_ID, email: 'member@rytask.local', name: 'Member' },
      {
        id: STRANGER,
        organizationId: SEED_ORG_ID,
        email: 'stranger@rytask.local',
        name: 'Stranger',
      },
    ]);
    await handle.db.insert(projectMembers).values({
      organizationId: SEED_ORG_ID,
      projectId: SEED_PROJECT_ID,
      userId: MEMBER,
      role: 'MEMBER',
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('saves a personal view visible ONLY to its owner', async () => {
    const view = await tenant.run(ctx(OWNER), () =>
      save.save({
        name: 'My personal board',
        kind: 'BOARD',
        scope: 'PERSONAL',
        projectId: SEED_PROJECT_ID,
        filters: { field: 'priority', operator: 'eq', value: 'URGENT' },
        sort: [{ field: 'priority', dir: 'desc' }],
      }),
    );
    expect(view.ownerId).toBe(OWNER);
    expect(view.scope).toBe('PERSONAL');

    const ownerSees = await tenant.run(ctx(OWNER), () => list.list(SEED_PROJECT_ID));
    expect(ownerSees.map((v) => v.id)).toContain(view.id);

    const memberSees = await tenant.run(ctx(MEMBER), () => list.list(SEED_PROJECT_ID));
    expect(memberSees.map((v) => v.id)).not.toContain(view.id);
  });

  it('saves a shared view visible to project members (not strangers)', async () => {
    const view = await tenant.run(ctx(OWNER), () =>
      save.save({
        name: 'Team backlog',
        kind: 'LIST',
        scope: 'SHARED',
        projectId: SEED_PROJECT_ID,
        filters: {},
      }),
    );

    const ownerSees = await tenant.run(ctx(OWNER), () => list.list(SEED_PROJECT_ID));
    expect(ownerSees.map((v) => v.id)).toContain(view.id);

    const memberSees = await tenant.run(ctx(MEMBER), () => list.list(SEED_PROJECT_ID));
    expect(memberSees.map((v) => v.id)).toContain(view.id);

    // A stranger is not a project member → listing the project is forbidden (VIEWER).
    await expect(
      tenant.run(ctx(STRANGER), () => list.list(SEED_PROJECT_ID)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Even cross-project (no projectId), the stranger never sees this project's shared view.
    const strangerCross = await tenant.run(ctx(STRANGER), () => list.list());
    expect(strangerCross.map((v) => v.id)).not.toContain(view.id);
  });

  it('updates and deletes a view (owner)', async () => {
    const view = await tenant.run(ctx(OWNER), () =>
      save.save({ name: 'Scratch', kind: 'LIST', scope: 'PERSONAL', projectId: SEED_PROJECT_ID }),
    );
    const renamed = await tenant.run(ctx(OWNER), () =>
      update.update(view.id, { name: 'Renamed', sort: [{ field: 'number', dir: 'asc' }] }),
    );
    expect(renamed.name).toBe('Renamed');
    expect(renamed.sort).toEqual([{ field: 'number', dir: 'asc' }]);

    await tenant.run(ctx(OWNER), () => del.delete(view.id));
    const after = await tenant.run(ctx(OWNER), () => list.list(SEED_PROJECT_ID));
    expect(after.map((v) => v.id)).not.toContain(view.id);
  });

  it("a non-owner cannot modify someone else's PERSONAL view", async () => {
    const view = await tenant.run(ctx(OWNER), () =>
      save.save({ name: 'Private', kind: 'LIST', scope: 'PERSONAL', projectId: SEED_PROJECT_ID }),
    );
    await expect(
      tenant.run(ctx(MEMBER), () => update.update(view.id, { name: 'Hijacked' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(tenant.run(ctx(MEMBER), () => del.delete(view.id))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects saving a view with a malformed filter AST (→ validation error)', async () => {
    await expect(
      tenant.run(ctx(OWNER), () =>
        save.save({
          name: 'Bad',
          kind: 'LIST',
          scope: 'PERSONAL',
          projectId: SEED_PROJECT_ID,
          filters: { field: 'bogus', operator: 'eq', value: 1 },
        }),
      ),
    ).rejects.toThrow();
  });

  it('lets a project MEMBER edit and delete a SHARED view (team artifact)', async () => {
    const shared = await tenant.run(ctx(OWNER), () =>
      save.save({ name: 'Team shared', kind: 'LIST', scope: 'SHARED', projectId: SEED_PROJECT_ID }),
    );
    const edited = await tenant.run(ctx(MEMBER), () =>
      update.update(shared.id, { name: 'Edited by member' }),
    );
    expect(edited.name).toBe('Edited by member');
    await tenant.run(ctx(MEMBER), () => del.delete(shared.id));
    const remaining = await tenant.run(ctx(OWNER), () => list.list(SEED_PROJECT_ID));
    expect(remaining.map((v) => v.id)).not.toContain(shared.id);
  });

  it('rejects update/delete with no authenticated principal', async () => {
    const view = await tenant.run(ctx(OWNER), () =>
      save.save({
        name: 'NoPrincipal',
        kind: 'LIST',
        scope: 'PERSONAL',
        projectId: SEED_PROJECT_ID,
      }),
    );
    const noUser = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID };
    await expect(tenant.run(noUser, () => update.update(view.id, { name: 'x' }))).rejects.toThrow();
    await expect(tenant.run(noUser, () => del.delete(view.id))).rejects.toThrow();
  });
});
