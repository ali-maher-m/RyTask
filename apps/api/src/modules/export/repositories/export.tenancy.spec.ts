import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  organizations,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workItems,
  workspaces,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { WorkspaceExportProvider } from '../providers/workspace-export.provider';
import { ExportRepository } from './export.repository';

/**
 * Cross-tenant isolation for the workspace export (M5, FR-TEN-001, AC-14): with TWO orgs in the
 * database, each org's archive contains ONLY its own rows — proven by exact counts AND by
 * serializing each archive and asserting the other org's ids never appear. The export is the
 * single widest read in the product; a leak here is the worst leak possible.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000b1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000b2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000b3';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000000b4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000b5';
const ITEM_B = '0193b3a0-0000-7000-8000-0000000000b6';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, workspaceId: WS_B, userId: USER_B };

const fixedClock: Clock = { now: () => new Date('2026-06-11T12:00:00.000Z') };

describe('workspace export tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: WorkspaceExportProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A: project RY, items RY-1..3, time logs
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    provider = new WorkspaceExportProvider(new ExportRepository(handle.db, tenant), fixedClock);

    // Stand up a minimal but real org B: workspace, member, project, status, one item.
    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-exp' });
    await handle.db
      .insert(workspaces)
      .values({ id: WS_B, organizationId: ORG_B, name: 'B WS', slug: 'ws-b-exp' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b-exp@b.test', name: 'B Owner' });
    await handle.db
      .insert(memberships)
      .values({ organizationId: ORG_B, workspaceId: WS_B, userId: USER_B, role: 'OWNER' });
    await handle.db.insert(projects).values({
      id: PROJECT_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      name: 'Bravo',
      keyPrefix: 'BRV',
    });
    await handle.db.insert(statuses).values({
      id: STATUS_B,
      organizationId: ORG_B,
      projectId: PROJECT_B,
      name: 'To Do',
      category: 'UNSTARTED',
      position: 1,
    });
    await handle.db.insert(workItems).values({
      id: ITEM_B,
      organizationId: ORG_B,
      workspaceId: WS_B,
      projectId: PROJECT_B,
      number: 1,
      title: 'Org B secret roadmap item',
      statusId: STATUS_B,
      reporterId: USER_B,
    });
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it("org A's archive contains only org A rows — none of org B's ids leak", async () => {
    const archive = await tenant.run(ctxA, () => provider.export());

    expect(archive.organization.id).toBe(SEED_ORG_ID);
    expect(archive.workItems.map((i) => i.key).sort()).toEqual(['RY-1', 'RY-2', 'RY-3']);

    const serialized = JSON.stringify(archive);
    for (const foreignId of [ORG_B, WS_B, USER_B, PROJECT_B, ITEM_B]) {
      expect(serialized).not.toContain(foreignId);
    }
    expect(serialized).not.toContain('Org B secret roadmap item');
  });

  it("org B's archive contains only org B rows — none of org A's ids leak", async () => {
    const archive = await tenant.run(ctxB, () => provider.export());

    expect(archive.organization.id).toBe(ORG_B);
    expect(archive.workItems).toHaveLength(1);
    expect(archive.workItems[0]?.key).toBe('BRV-1');
    expect(archive.timeLogs).toHaveLength(0); // org A's seeded logs do NOT bleed through

    const serialized = JSON.stringify(archive);
    for (const foreignId of [SEED_ORG_ID, SEED_WORKSPACE_ID, SEED_USER_ID]) {
      expect(serialized).not.toContain(foreignId);
    }
  });
});
