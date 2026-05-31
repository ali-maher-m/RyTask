import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { systemClock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../repositories/project-members.repository';
import { ProjectsRepository } from '../repositories/projects.repository';
import { ProjectAccessServiceImpl } from '../services/project-access.service';
import { ArchiveProjectProvider } from './archive-project.provider';
import { CreateProjectProvider } from './create-project.provider';
import { DeleteProjectProvider } from './delete-project.provider';
import { GetProjectProvider } from './get-project.provider';
import { ListProjectsProvider } from './list-projects.provider';
import { UpdateProjectProvider } from './update-project.provider';

/**
 * Integration coverage for the project CRUD read/update/archive/delete providers (US4,
 * FR-PROJ-001/002) against REAL PostgreSQL. SEED_USER is ADMIN of the seeded project.
 */
const MISSING_ID = '0193b3a0-0000-7000-8000-0000000000ff';
const STRANGER_ID = '0193b3a0-0000-7000-8000-0000000000fd';

const member = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: SEED_USER_ID,
};
const orgAdmin = { ...member, isOrgAdmin: true };
const stranger = {
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  userId: STRANGER_ID,
};

describe('Projects CRUD providers (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let create: CreateProjectProvider;
  let list: ListProjectsProvider;
  let get: GetProjectProvider;
  let update: UpdateProjectProvider;
  let archive: ArchiveProjectProvider;
  let del: DeleteProjectProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const projects = new ProjectsRepository(handle.db, tenant);
    const members = new ProjectMembersRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(members, tenant);
    create = new CreateProjectProvider(projects, tenant);
    list = new ListProjectsProvider(projects, access, tenant);
    get = new GetProjectProvider(projects, access);
    update = new UpdateProjectProvider(projects, access, systemClock);
    archive = new ArchiveProjectProvider(projects, access, systemClock);
    del = new DeleteProjectProvider(projects, access);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  describe('list', () => {
    it('returns the projects the member can access', async () => {
      const res = await tenant.run(member, () => list.list({ limit: 50, includeArchived: false }));
      expect(res.data.map((p) => p.id)).toContain(SEED_PROJECT_ID);
    });

    it('returns empty when the request has no workspace in context', async () => {
      const res = await tenant.run({ organizationId: SEED_ORG_ID, userId: SEED_USER_ID }, () =>
        list.list({ limit: 50, includeArchived: false }),
      );
      expect(res.data).toEqual([]);
      expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it('an org admin sees projects without the membership filter, and pages with a keyset cursor', async () => {
      await tenant.run(member, () => create.create({ name: 'Second', keyPrefix: 'SEC' }));
      const firstPage = await tenant.run(orgAdmin, () =>
        list.list({ limit: 1, includeArchived: true }),
      );
      expect(firstPage.data).toHaveLength(1);
      expect(firstPage.pageInfo.hasNextPage).toBe(true);
      expect(firstPage.pageInfo.nextCursor).not.toBeNull();
    });
  });

  describe('get', () => {
    it('returns a project for a member (VIEWER satisfied)', async () => {
      const p = await tenant.run(member, () => get.get(SEED_PROJECT_ID));
      expect(p.id).toBe(SEED_PROJECT_ID);
    });

    it('404s a missing project (org admin bypasses the membership check, then misses)', async () => {
      await expect(tenant.run(orgAdmin, () => get.get(MISSING_ID))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('403s a non-member (FR-PROJ-002)', async () => {
      await expect(tenant.run(stranger, () => get.get(SEED_PROJECT_ID))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('update / archive', () => {
    it('renames, recolors, and toggles archive on/off', async () => {
      const renamed = await tenant.run(member, () =>
        update.update(SEED_PROJECT_ID, { name: '  Renamed  ', color: '#abcdef', archived: true }),
      );
      expect(renamed.name).toBe('Renamed');
      expect(renamed.color).toBe('#abcdef');
      expect(renamed.archivedAt).not.toBeNull();

      const restored = await tenant.run(member, () =>
        update.update(SEED_PROJECT_ID, { archived: false }),
      );
      expect(restored.archivedAt).toBeNull();
    });

    it('404s updating a missing project', async () => {
      await expect(
        tenant.run(orgAdmin, () => update.update(MISSING_ID, { name: 'x' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('archive provider sets and clears archived_at', async () => {
      const archived = await tenant.run(member, () => archive.setArchived(SEED_PROJECT_ID, true));
      expect(archived.archivedAt).not.toBeNull();
      const active = await tenant.run(member, () => archive.setArchived(SEED_PROJECT_ID, false));
      expect(active.archivedAt).toBeNull();
    });

    it('404s archiving a missing project', async () => {
      await expect(
        tenant.run(orgAdmin, () => archive.setArchived(MISSING_ID, true)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('hard-deletes a project and 404s the second time', async () => {
      const doomed = await tenant.run(member, () =>
        create.create({ name: 'Doomed', keyPrefix: 'DIE' }),
      );
      await tenant.run(member, () => del.delete(doomed.id));
      // The project (and its cascade) is gone — an org admin now misses it (404).
      await expect(tenant.run(orgAdmin, () => get.get(doomed.id))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(tenant.run(orgAdmin, () => del.delete(doomed.id))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
