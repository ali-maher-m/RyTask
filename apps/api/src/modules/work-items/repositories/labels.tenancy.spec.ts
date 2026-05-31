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
import { LabelsRepository } from './labels.repository';
import { WorkItemsRepository } from './work-items.repository';

/**
 * Cross-tenant isolation for `labels` + `work_item_labels` (T033, FR-TEN-003, SC-014).
 * Org A can never read/write Org B's labels or label-links — enforced structurally by
 * TenantScopedRepository (workspace-scoped reads + org-scoped junction), proven against
 * real Postgres. Mirrors repositories/work-items.tenancy.spec.ts.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000c1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000c2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000c3';
const PROJ_B = '0193b3a0-0000-7000-8000-0000000000c4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000c5';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

describe('labels tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let labelsA: LabelsRepository;
  let labelsB: LabelsRepository;
  let wiA: WorkItemsRepository;
  let wiB: WorkItemsRepository;
  let labelAId: string;
  let labelBId: string;
  let itemAId: string;
  let itemBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    labelsA = new LabelsRepository(handle.db, tenant);
    labelsB = new LabelsRepository(handle.db, tenant);
    wiA = new WorkItemsRepository(handle.db, tenant);
    wiB = new WorkItemsRepository(handle.db, tenant);

    // Stand up a second, fully separate org B.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-lbl' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'WS', slug: 'ws-b-lbl' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@lbl.test', name: 'B' });
    await handle.db.insert(projects).values({
      id: PROJ_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bproj',
      keyPrefix: 'OBL',
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

    // A label + a work item with a label attached, in each org.
    labelAId = await tenant.run(ctxA, () => labelsA.findOrCreateByName('shared-name'));
    labelBId = await tenant.run(ctxB, () => labelsB.findOrCreateByName('shared-name'));
    const a = await tenant.run(ctxA, () =>
      wiA.createWorkItem({
        projectId: SEED_PROJECT_ID,
        title: 'A',
        statusId: SEED_STATUS_IDS.todo,
        priority: 'NONE',
        labelIds: [labelAId],
      }),
    );
    const b = await tenant.run(ctxB, () =>
      wiB.createWorkItem({
        projectId: PROJ_B,
        title: 'B',
        statusId: STATUS_B,
        priority: 'NONE',
        labelIds: [labelBId],
      }),
    );
    itemAId = a.item.id;
    itemBId = b.item.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org sees only its own labels (same name → distinct ids)', async () => {
    expect(labelAId).not.toBe(labelBId);
    const listA = await tenant.run(ctxA, () => labelsA.list());
    const listB = await tenant.run(ctxB, () => labelsB.list());
    expect(listA.map((l) => l.id)).toContain(labelAId);
    expect(listA.map((l) => l.id)).not.toContain(labelBId);
    expect(listB.map((l) => l.id)).toContain(labelBId);
    expect(listB.map((l) => l.id)).not.toContain(labelAId);
  });

  it("never resolves another org's label by id", async () => {
    expect(await tenant.run(ctxA, () => labelsA.findById(labelBId))).toBeNull();
    expect(await tenant.run(ctxB, () => labelsB.findById(labelAId))).toBeNull();
  });

  it('never leaks work_item_labels across tenants', async () => {
    // Org A reads its own link, but not org B's, and vice-versa.
    expect(await tenant.run(ctxA, () => labelsA.listForItem(itemAId))).toEqual([labelAId]);
    expect(await tenant.run(ctxA, () => labelsA.listForItem(itemBId))).toEqual([]);
    expect(await tenant.run(ctxB, () => labelsB.listForItem(itemBId))).toEqual([labelBId]);
    expect(await tenant.run(ctxB, () => labelsB.listForItem(itemAId))).toEqual([]);
  });

  it("detach is org-scoped — org A cannot remove org B's label-link", async () => {
    await tenant.run(ctxA, () => labelsA.detach(itemBId, labelBId));
    // Org B's link is untouched.
    expect(await tenant.run(ctxB, () => labelsB.listForItem(itemBId))).toEqual([labelBId]);
  });
});
