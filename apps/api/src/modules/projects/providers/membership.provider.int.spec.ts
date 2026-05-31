import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../repositories/project-members.repository';
import { ProjectsRepository } from '../repositories/projects.repository';
import { ProjectAccessServiceImpl } from '../services/project-access.service';
import { MembershipProvider } from './membership.provider';

/**
 * Integration test against REAL PostgreSQL (T064, FR-PROJ-002). Proves: ADMIN can add a
 * member; the new member can then read the project; a non-member is denied (403). Listing
 * members requires VIEWER.
 */
const ADMIN_CTX = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: SEED_USER_ID,
};
const NEW_USER_ID = '0193b3a0-0000-7000-8000-0000000000a1';
const STRANGER_ID = '0193b3a0-0000-7000-8000-0000000000a2';

describe('MembershipProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: MembershipProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const members = new ProjectMembersRepository(handle.db, tenant);
    const projects = new ProjectsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(members, tenant);
    provider = new MembershipProvider(members, projects, access);

    // Two extra users in the same org: one to be added, one stranger.
    await handle.db.insert(users).values([
      { id: NEW_USER_ID, organizationId: SEED_ORG_ID, email: 'new@rytask.local', name: 'Newbie' },
      {
        id: STRANGER_ID,
        organizationId: SEED_ORG_ID,
        email: 'stranger@rytask.local',
        name: 'Stranger',
      },
    ]);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('ADMIN can add a member, who then appears in the members list', async () => {
    await tenant.run(ADMIN_CTX, () =>
      provider.add(SEED_PROJECT_ID, { userId: NEW_USER_ID, role: 'MEMBER' }),
    );
    const list = await tenant.run(ADMIN_CTX, () => provider.list(SEED_PROJECT_ID));
    const added = list.find((m) => m.userId === NEW_USER_ID);
    expect(added).toMatchObject({ userId: NEW_USER_ID, role: 'MEMBER', name: 'Newbie' });
  });

  it('the newly added member can read the members list (VIEWER satisfied)', async () => {
    const memberCtx = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: NEW_USER_ID,
    };
    const list = await tenant.run(memberCtx, () => provider.list(SEED_PROJECT_ID));
    expect(list.some((m) => m.userId === NEW_USER_ID)).toBe(true);
  });

  it('a non-member is denied the project members (403, FR-PROJ-002)', async () => {
    const strangerCtx = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: STRANGER_ID,
    };
    await expect(tenant.run(strangerCtx, () => provider.list(SEED_PROJECT_ID))).rejects.toThrow();
  });

  it('a non-admin member cannot add another member (requires ADMIN)', async () => {
    const memberCtx = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: NEW_USER_ID,
    };
    await expect(
      tenant.run(memberCtx, () =>
        provider.add(SEED_PROJECT_ID, { userId: STRANGER_ID, role: 'MEMBER' }),
      ),
    ).rejects.toThrow();
  });
});
