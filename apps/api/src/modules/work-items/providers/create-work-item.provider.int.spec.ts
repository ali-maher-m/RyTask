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
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ActivityRepository } from '../repositories/activity.repository';
import { LabelsRepository } from '../repositories/labels.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { CreateWorkItemProvider } from './create-work-item.provider';

/**
 * Integration test against REAL PostgreSQL (T017, §14.1). Proves capture end-to-end:
 * project defaults, atomic never-recycled keys, quick-add token application, the
 * CREATED activity row, and project:member RBAC.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const clock: Clock = { now: () => new Date('2026-05-31T12:00:00.000Z') };

describe('CreateWorkItemProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: CreateWorkItemProvider;
  let activityRepo: ActivityRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const wi = new WorkItemsRepository(handle.db, tenant);
    const labels = new LabelsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new CreateWorkItemProvider(wi, labels, access, clock, tenant);
    activityRepo = new ActivityRepository(handle.db, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('title-only create applies project defaults + one CREATED activity row', async () => {
    const r = await tenant.run(CTX, () =>
      provider.create({ projectId: SEED_PROJECT_ID, title: 'A new task' }),
    );
    expect(r.item.number).toBe(4); // seed minted 1..3 → next is 4
    expect(r.keyPrefix).toBe('RY');
    expect(r.item.statusId).toBe(SEED_STATUS_IDS.todo); // first UNSTARTED
    expect(r.item.priority).toBe('NONE');
    expect(r.item.assigneeId).toBeNull();
    expect(r.item.reporterId).toBe(SEED_USER_ID);

    const log = await tenant.run(CTX, () => activityRepo.listForItem(r.item.id));
    expect(log).toHaveLength(1);
    expect(log[0]?.action).toBe('CREATED');
  });

  it('quick-add applies every token and resolves @founder to a member', async () => {
    const r = await tenant.run(CTX, () =>
      provider.create({
        projectId: SEED_PROJECT_ID,
        quickAdd: 'Fix login redirect @founder #bug !urgent ^2026-07-04',
      }),
    );
    expect(r.item.title).toBe('Fix login redirect');
    expect(r.item.priority).toBe('URGENT');
    expect(r.item.dueDate).toBe('2026-07-04');
    expect(r.item.assigneeId).toBe(SEED_USER_ID);
    expect(r.labelIds).toHaveLength(1);
    expect(r.unresolved).toEqual([]);
  });

  it('mints sequential, never-recycled keys', async () => {
    const a = await tenant.run(CTX, () =>
      provider.create({ projectId: SEED_PROJECT_ID, title: 'seq-a' }),
    );
    const b = await tenant.run(CTX, () =>
      provider.create({ projectId: SEED_PROJECT_ID, title: 'seq-b' }),
    );
    expect(b.item.number).toBe(a.item.number + 1);
  });

  it('flags an unresolvable @handle instead of dropping it (SC-002)', async () => {
    const r = await tenant.run(CTX, () =>
      provider.create({ projectId: SEED_PROJECT_ID, quickAdd: 'Task @nobody-here' }),
    );
    expect(r.item.assigneeId).toBeNull();
    expect(r.unresolved).toContainEqual({ token: '@nobody-here', kind: 'assignee' });
  });

  it('rejects a non-member (RBAC project:member → Forbidden)', async () => {
    const stranger = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: '0193b3a0-0000-7000-8000-0000000000ff',
    };
    await expect(
      tenant.run(stranger, () => provider.create({ projectId: SEED_PROJECT_ID, title: 'nope' })),
    ).rejects.toThrow();
  });
});
