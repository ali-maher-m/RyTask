import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ExportRepository } from '../repositories/export.repository';
import { WorkspaceExportProvider } from './workspace-export.provider';

/**
 * Integration test against REAL PostgreSQL (M5, AC-12, FR-PORT-003/004). The archive is COMPLETE
 * over the seeded workspace: every section is populated, `counts` match section lengths, items
 * carry their human keys, and a soft-deleted item STAYS in the archive flagged with `deletedAt`
 * (a safe exit does not hide the trash).
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

/** Seeded item RY-3 — soft-deleted mid-test. */
const RY3 = '0193b3a0-0000-7000-8000-000000000022';

const FIXED_NOW = new Date('2026-06-11T12:00:00.000Z');
const fixedClock: Clock = { now: () => FIXED_NOW };

describe('WorkspaceExportProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: WorkspaceExportProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    provider = new WorkspaceExportProvider(new ExportRepository(handle.db, tenant), fixedClock);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('exports a complete archive of the seeded workspace with matching counts', async () => {
    const archive = await tenant.run(CTX, () => provider.export());

    expect(archive.format).toBe('rytask.workspace-export');
    expect(archive.version).toBe(1);
    expect(archive.exportedAt).toBe(FIXED_NOW.toISOString());
    expect(archive.organization.id).toBe(SEED_ORG_ID);

    // Seeded shape: 1 workspace, 1 project with 5 statuses, items RY-1..3, 4 finalized logs.
    expect(archive.workspaces).toHaveLength(1);
    expect(archive.projects).toHaveLength(1);
    expect(archive.projects[0]?.keyPrefix).toBe('RY');
    expect(archive.statuses.length).toBeGreaterThanOrEqual(5);
    expect(archive.workItems.map((i) => i.key).sort()).toEqual(['RY-1', 'RY-2', 'RY-3']);
    expect(archive.timeLogs.length).toBeGreaterThanOrEqual(4);

    // The founder is a member with the OWNER role.
    expect(archive.members.some((m) => m.userId === SEED_USER_ID && m.role === 'OWNER')).toBe(true);

    // Counts are derived from the SAME arrays — a self-consistency check the reader can trust.
    expect(archive.counts).toEqual({
      workspaces: archive.workspaces.length,
      members: archive.members.length,
      projects: archive.projects.length,
      statuses: archive.statuses.length,
      labels: archive.labels.length,
      workItems: archive.workItems.length,
      comments: archive.comments.length,
      timeLogs: archive.timeLogs.length,
    });

    // Every time log reconciles: duration is exact integer seconds (the M2 invariant).
    for (const log of archive.timeLogs) {
      expect(Number.isInteger(log.durationSeconds)).toBe(true);
    }
  });

  it('keeps a soft-deleted item in the archive, flagged with deletedAt', async () => {
    await handle.db
      .update(workItems)
      .set({ deletedAt: new Date('2026-06-11T11:00:00.000Z') })
      .where(eq(workItems.id, RY3));

    const archive = await tenant.run(CTX, () => provider.export());
    const trashed = archive.workItems.find((i) => i.key === 'RY-3');

    expect(archive.workItems).toHaveLength(3); // still complete
    expect(trashed?.deletedAt).toBe('2026-06-11T11:00:00.000Z');
  });
});
