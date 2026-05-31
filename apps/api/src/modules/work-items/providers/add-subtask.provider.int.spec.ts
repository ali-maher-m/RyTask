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
import { LabelsRepository } from '../repositories/labels.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { AddSubtaskProvider } from './add-subtask.provider';
import { CreateWorkItemProvider } from './create-work-item.provider';

/**
 * Integration test for sub-tasks against REAL PostgreSQL (T091, FR-HIER-001). Proves nested
 * create sets `parent_id`, the parent's child count reflects its children, the recursive-CTE
 * ancestor walk that the cycle/depth policy consumes is correct (≥3 levels), and the due
 * date persists independently of the start/end range.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const clock: Clock = { now: () => new Date('2026-05-31T12:00:00.000Z') };

describe('AddSubtaskProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: WorkItemsRepository;
  let provider: AddSubtaskProvider;

  /** Create a fresh top-level work item in the seeded project (first UNSTARTED status). */
  const createRoot = (title: string) =>
    tenant.run(CTX, () =>
      repo.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title,
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
      }),
    );

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new WorkItemsRepository(handle.db, tenant);
    const labels = new LabelsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    const createProvider = new CreateWorkItemProvider(repo, labels, access, clock, tenant);
    provider = new AddSubtaskProvider(repo, createProvider, access);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('nested create sets parent_id; the parent child count reflects children; ≥3 levels', async () => {
    const root = await createRoot('Root task');

    const childA = await tenant.run(CTX, () =>
      provider.addSubtask(root.item.id, { title: 'Child A' }),
    );
    const childB = await tenant.run(CTX, () =>
      provider.addSubtask(root.item.id, { title: 'Child B' }),
    );
    expect(childA.item.parentId).toBe(root.item.id);
    expect(childB.item.parentId).toBe(root.item.id);

    const count = await tenant.run(CTX, () => repo.childCount(root.item.id));
    expect(count).toBe(2);

    // ≥3 levels deep: grandchild under childA. The CTE ancestor walk is root-first.
    const grandchild = await tenant.run(CTX, () =>
      provider.addSubtask(childA.item.id, { title: 'Grandchild' }),
    );
    expect(grandchild.item.parentId).toBe(childA.item.id);
    const ancestors = await tenant.run(CTX, () => repo.ancestorIds(grandchild.item.id));
    expect(ancestors).toEqual([root.item.id, childA.item.id]);
  });

  it('persists the due date independently of the start/end range', async () => {
    const root = await createRoot('Dated parent');
    const child = await tenant.run(CTX, () =>
      provider.addSubtask(root.item.id, {
        title: 'Dated child',
        dueDate: '2026-08-01',
        startDate: '2026-07-01',
        endDate: '2026-07-15',
      }),
    );
    expect(child.item.dueDate).toBe('2026-08-01');
    expect(child.item.startDate).toBe('2026-07-01');
    expect(child.item.endDate).toBe('2026-07-15');
  });

  it('the recursive-CTE ancestor walk never contains the item itself (cycle-safe input)', async () => {
    const root = await createRoot('Cycle root');
    const child = await tenant.run(CTX, () =>
      provider.addSubtask(root.item.id, { title: 'Cycle child' }),
    );
    // A nested create is always a fresh leaf, so a cycle is structurally impossible; the
    // cycle RULE is unit-tested in hierarchy.policy.spec.ts. Here we assert the ancestor
    // walk the policy consumes is well-formed: root-first and excluding the node itself.
    const chain = await tenant.run(CTX, () => repo.ancestorIds(child.item.id));
    expect(chain).toEqual([root.item.id]);
    expect(chain).not.toContain(child.item.id);
  });

  it('rejects adding a sub-task to a missing parent (NotFound)', async () => {
    await expect(
      tenant.run(CTX, () =>
        provider.addSubtask('0193b3a0-0000-7000-8000-0000000000ee', { title: 'orphan' }),
      ),
    ).rejects.toThrow();
  });
});
