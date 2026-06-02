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
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { ListWorkItemsProvider } from './list-work-items.provider';

/**
 * Integration test against REAL PostgreSQL for the List/Board read path (T055,
 * FR-VIEW-001/002/006/007/010). Exercises the shared query engine end-to-end against the
 * seeded data: project scope, status filter (board column), priority sort, the computed
 * `overdue` flag, and keyset pagination producing a usable cursor.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const clock: Clock = { now: () => new Date('2026-05-31T12:00:00.000Z') };

function base64Filter(ast: unknown): string {
  return Buffer.from(JSON.stringify(ast), 'utf8').toString('base64');
}

describe('ListWorkItemsProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: ListWorkItemsProvider;
  let repo: WorkItemsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new WorkItemsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new ListWorkItemsProvider(repo, access, clock, tenant);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists a project sorted by number with no next page', async () => {
    const res = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, sort: 'number', limit: 50 }),
    );
    expect(res.data.length).toBe(3); // seed minted 3 items
    expect(res.data.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(res.pageInfo.hasNextPage).toBe(false);
    expect(res.data[0]?.key).toBe('RY-1');
  });

  it('filters by status (a board column) via the filter AST', async () => {
    const filter = base64Filter({
      field: 'status',
      operator: 'eq',
      value: SEED_STATUS_IDS.todo,
    });
    const res = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, filter, limit: 50 }),
    );
    // Seed put items #1 and #3 in To Do.
    expect(res.data.map((i) => i.number).sort()).toEqual([1, 3]);
    expect(res.data.every((i) => i.statusId === SEED_STATUS_IDS.todo)).toBe(true);
  });

  it('sorts by priority desc (URGENT→NONE by rank)', async () => {
    const res = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, sort: '-priority', limit: 50 }),
    );
    // Seed priorities: #1 MEDIUM, #2 HIGH, #3 LOW → desc order HIGH, MEDIUM, LOW.
    expect(res.data.map((i) => i.priority)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });

  it('paginates with a keyset cursor (limit 2 → next page of 1)', async () => {
    const first = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, sort: 'number', limit: 2 }),
    );
    expect(first.data.map((i) => i.number)).toEqual([1, 2]);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(first.pageInfo.nextCursor).not.toBeNull();

    const second = await tenant.run(CTX, () =>
      provider.list({
        projectId: SEED_PROJECT_ID,
        sort: 'number',
        limit: 2,
        cursor: first.pageInfo.nextCursor as string,
      }),
    );
    expect(second.data.map((i) => i.number)).toEqual([3]);
    expect(second.pageInfo.hasNextPage).toBe(false);
  });

  it('computes overdue=false for items with no past-due date', async () => {
    const res = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, limit: 50 }),
    );
    expect(res.data.every((i) => i.overdue === false)).toBe(true);
  });

  it('keyset-paginates a nullable sort (dueDate) without dropping NULL-valued rows (SC-006)', async () => {
    // Add a mix of due / no-due items so the sort column carries NULLs.
    const mk = (title: string, dueDate: string | null) =>
      tenant.run(CTX, () =>
        repo.createWorkItem({
          projectId: SEED_PROJECT_ID,
          title,
          statusId: SEED_STATUS_IDS.todo,
          priority: 'NONE',
          reporterId: SEED_USER_ID,
          dueDate,
        }),
      );
    await mk('due-a', '2026-07-01');
    await mk('no-due-1', null);
    await mk('due-b', '2026-07-05');
    await mk('no-due-2', null);

    // Walk every page (limit 1) sorting by the nullable dueDate; collect ids.
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 100; guard++) {
      const page = await tenant.run(CTX, () =>
        provider.list({ projectId: SEED_PROJECT_ID, sort: 'dueDate', limit: 1, cursor }),
      );
      seen.push(...page.data.map((i) => i.id));
      if (!page.pageInfo.hasNextPage) break;
      cursor = page.pageInfo.nextCursor as string;
    }

    // The single-page read of everything is the ground truth; the paged walk must match it exactly
    // — no NULL-dueDate row dropped on page ≥2 (the bug), no duplicates.
    const all = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, sort: 'dueDate', limit: 100 }),
    );
    const allIds = all.data.map((i) => i.id);
    expect(seen.length).toBe(allIds.length);
    expect(new Set(seen)).toEqual(new Set(allIds));
    expect(seen.length).toBeGreaterThanOrEqual(4); // the rows we added are all present
  });

  it('rejects a non-member reading the project (RBAC project:viewer)', async () => {
    const stranger = {
      organizationId: SEED_ORG_ID,
      workspaceId: SEED_WORKSPACE_ID,
      userId: '0193b3a0-0000-7000-8000-0000000000ee',
    };
    await expect(
      tenant.run(stranger, () => provider.list({ projectId: SEED_PROJECT_ID, limit: 50 })),
    ).rejects.toThrow();
  });
});
