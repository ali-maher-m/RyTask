import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_STATUS_IDS,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  labels,
  runMigrations,
  seed,
  workItemLabels,
  workItems,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ProjectMembersRepository } from '../../projects/repositories/project-members.repository';
import { ProjectAccessServiceImpl } from '../../projects/services/project-access.service';
import { ListWorkItemsProvider } from '../../work-items/providers/list-work-items.provider';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';

/**
 * Compound-filter correctness against REAL PostgreSQL (T077, SC-006 / FR-VIEW-006). Over a
 * deliberately built fixture, the engine-compiled compound filter
 * `priority = URGENT AND (label = bug OR overdue)` must return EXACTLY the independently
 * computed expected set — zero false positives, zero false negatives. The compound filter
 * is what powers saved/smart views, so getting it provably right is the whole point.
 *
 * "today" is fixed to 2026-05-31, so overdue := dueDate < 2026-05-31 AND not in a closed
 * (COMPLETED/CANCELLED) status. The fixture rows are designed to exercise every branch.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const clock: Clock = { now: () => new Date('2026-05-31T12:00:00.000Z') };

const BUG_LABEL = '0193b3a0-0000-7000-8000-0000000f0001';
const CHORE_LABEL = '0193b3a0-0000-7000-8000-0000000f0002';

/** A fixture work item with the inputs the compound filter discriminates on. */
interface Fixture {
  id: string;
  number: number;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  statusId: string;
  /** YYYY-MM-DD or null. */
  dueDate: string | null;
  labelIds: string[];
}

const PAST = '2026-05-20'; // before today → overdue (unless closed)
const FUTURE = '2026-06-20'; // after today → not overdue

const FIXTURES: Fixture[] = [
  // Urgent + bug label → matches (label branch).
  {
    id: id(1),
    number: 101,
    priority: 'URGENT',
    statusId: SEED_STATUS_IDS.todo,
    dueDate: null,
    labelIds: [BUG_LABEL],
  },
  // Urgent + overdue (past due, open status) → matches (overdue branch).
  {
    id: id(2),
    number: 102,
    priority: 'URGENT',
    statusId: SEED_STATUS_IDS.inProgress,
    dueDate: PAST,
    labelIds: [],
  },
  // Urgent + bug + overdue → matches (both branches; still one row).
  {
    id: id(3),
    number: 103,
    priority: 'URGENT',
    statusId: SEED_STATUS_IDS.todo,
    dueDate: PAST,
    labelIds: [BUG_LABEL],
  },
  // Urgent but NO bug and NOT overdue (future due) → excluded (inner OR fails).
  {
    id: id(4),
    number: 104,
    priority: 'URGENT',
    statusId: SEED_STATUS_IDS.todo,
    dueDate: FUTURE,
    labelIds: [CHORE_LABEL],
  },
  // Urgent + past due BUT in a closed (Done) status → NOT overdue, no bug → excluded.
  {
    id: id(5),
    number: 105,
    priority: 'URGENT',
    statusId: SEED_STATUS_IDS.done,
    dueDate: PAST,
    labelIds: [],
  },
  // HIGH (not urgent) + bug + overdue → excluded (outer AND fails on priority).
  {
    id: id(6),
    number: 106,
    priority: 'HIGH',
    statusId: SEED_STATUS_IDS.todo,
    dueDate: PAST,
    labelIds: [BUG_LABEL],
  },
  // LOW + chore + future → excluded entirely.
  {
    id: id(7),
    number: 107,
    priority: 'LOW',
    statusId: SEED_STATUS_IDS.todo,
    dueDate: FUTURE,
    labelIds: [CHORE_LABEL],
  },
];

function id(n: number): string {
  return `0193b3a0-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`;
}

/** The expected matches, computed independently from the rule (no SQL). */
function expectedMatches(): Set<number> {
  const closed = new Set<string>([SEED_STATUS_IDS.done, SEED_STATUS_IDS.cancelled]);
  const today = '2026-05-31';
  const out = new Set<number>();
  for (const f of FIXTURES) {
    const isUrgent = f.priority === 'URGENT';
    const hasBug = f.labelIds.includes(BUG_LABEL);
    const overdue = f.dueDate != null && f.dueDate < today && !closed.has(f.statusId);
    if (isUrgent && (hasBug || overdue)) {
      out.add(f.number);
    }
  }
  return out;
}

function base64(ast: unknown): string {
  return Buffer.from(JSON.stringify(ast), 'utf8').toString('base64');
}

describe('compound filter correctness (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let provider: ListWorkItemsProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    const repo = new WorkItemsRepository(handle.db, tenant);
    const access = new ProjectAccessServiceImpl(
      new ProjectMembersRepository(handle.db, tenant),
      tenant,
    );
    provider = new ListWorkItemsProvider(repo, access, clock, tenant);

    // Two workspace labels.
    await handle.db.insert(labels).values([
      { id: BUG_LABEL, organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, name: 'bug' },
      {
        id: CHORE_LABEL,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        name: 'chore',
      },
    ]);

    // The fixture work items (numbers 101+ avoid clashing with the 3 seeded items).
    await handle.db.insert(workItems).values(
      FIXTURES.map((f) => ({
        id: f.id,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        projectId: SEED_PROJECT_ID,
        number: f.number,
        title: `fixture ${f.number}`,
        statusId: f.statusId,
        priority: f.priority,
        reporterId: SEED_USER_ID,
        dueDate: f.dueDate,
      })),
    );

    const links = FIXTURES.flatMap((f) =>
      f.labelIds.map((labelId) => ({
        organizationId: SEED_ORG_ID,
        workItemId: f.id,
        labelId,
      })),
    );
    if (links.length > 0) {
      await handle.db.insert(workItemLabels).values(links);
    }
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('`priority = URGENT AND (label = bug OR overdue)` returns EXACTLY the expected set', async () => {
    const ast = {
      op: 'and',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'URGENT' },
        {
          op: 'or',
          conditions: [
            { field: 'label', operator: 'in', value: [BUG_LABEL] },
            { field: 'overdue', operator: 'eq', value: true },
          ],
        },
      ],
    };

    const res = await tenant.run(CTX, () =>
      provider.list({ projectId: SEED_PROJECT_ID, filter: base64(ast), limit: 200 }),
    );

    const got = new Set(res.data.map((i) => i.number).filter((n) => n >= 101));
    const want = expectedMatches();

    // Exact match: no false positives (extra rows) and no false negatives (missing rows).
    expect([...got].sort((a, b) => a - b)).toEqual([...want].sort((a, b) => a - b));
    expect(got).toEqual(want);
    // Sanity: the rule actually selected a non-trivial subset (101, 102, 103).
    expect(want).toEqual(new Set([101, 102, 103]));
  });
});
