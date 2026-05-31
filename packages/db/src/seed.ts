import { createDb } from './client';
import {
  organizations,
  projectCounters,
  projectMembers,
  projects,
  statuses,
  users,
  workItems,
  workspaces,
} from './tables';

/**
 * Deterministic seed (fixed UUIDv7 ids + fixed values) so `docker compose up`
 * and tests are reproducible (ARCHITECTURE §14.4). Idempotent via onConflictDoNothing.
 *
 * Yields a usable workspace immediately (quickstart §1): a default org/workspace/user,
 * one project ("RY") with its key counter, the six categorized statuses
 * (To Do/In Progress/Review/Done + Backlog/Cancelled), and a few work items — so US1/US2/US3
 * and the Albert/Marissa check (SC-008) are demonstrable with no setup.
 */
export const SEED_ORG_ID = '0193b3a0-0000-7000-8000-000000000001';
export const SEED_WORKSPACE_ID = '0193b3a0-0000-7000-8000-000000000002';
export const SEED_USER_ID = '0193b3a0-0000-7000-8000-000000000003';
export const SEED_PROJECT_ID = '0193b3a0-0000-7000-8000-000000000010';

/** Status ids (fixed) — exported so tests can target the seeded statuses. */
export const SEED_STATUS_IDS = {
  backlog: '0193b3a0-0000-7000-8000-000000000011',
  todo: '0193b3a0-0000-7000-8000-000000000012',
  inProgress: '0193b3a0-0000-7000-8000-000000000013',
  review: '0193b3a0-0000-7000-8000-000000000014',
  done: '0193b3a0-0000-7000-8000-000000000015',
  cancelled: '0193b3a0-0000-7000-8000-000000000016',
} as const;

export async function seed(
  connectionString: string | undefined = process.env.DATABASE_URL,
): Promise<void> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed');
  }
  const { db, pool } = createDb(connectionString);
  try {
    await db
      .insert(organizations)
      .values({ id: SEED_ORG_ID, name: 'RyTask Demo', slug: 'demo' })
      .onConflictDoNothing();
    await db
      .insert(workspaces)
      .values({
        id: SEED_WORKSPACE_ID,
        organizationId: SEED_ORG_ID,
        name: 'Default',
        slug: 'default',
      })
      .onConflictDoNothing();
    await db
      .insert(users)
      .values({
        id: SEED_USER_ID,
        organizationId: SEED_ORG_ID,
        email: 'founder@rytask.local',
        name: 'Founder',
      })
      .onConflictDoNothing();

    // One project + its key counter (FR-PROJ-001, FR-WI-002).
    await db
      .insert(projects)
      .values({
        id: SEED_PROJECT_ID,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        name: 'RyTask',
        keyPrefix: 'RY',
        description: 'The demo project — capture, track, and ship.',
        color: '#6366F1',
        leadId: SEED_USER_ID,
      })
      .onConflictDoNothing();

    // The founder is an ADMIN member of the project (FR-PROJ-002) so RBAC + the demo work.
    await db
      .insert(projectMembers)
      .values({
        organizationId: SEED_ORG_ID,
        projectId: SEED_PROJECT_ID,
        userId: SEED_USER_ID,
        role: 'ADMIN',
      })
      .onConflictDoNothing();

    // The six categorized statuses (FR-WF-001), ordered for a sensible board.
    await db
      .insert(statuses)
      .values([
        {
          id: SEED_STATUS_IDS.backlog,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'Backlog',
          category: 'BACKLOG',
          color: '#6B7280',
          position: 0,
        },
        {
          id: SEED_STATUS_IDS.todo,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'To Do',
          category: 'UNSTARTED',
          color: '#9CA3AF',
          position: 1,
        },
        {
          id: SEED_STATUS_IDS.inProgress,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'In Progress',
          category: 'STARTED',
          color: '#3B82F6',
          position: 2,
        },
        {
          id: SEED_STATUS_IDS.review,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'Review',
          category: 'STARTED',
          color: '#A855F7',
          position: 3,
        },
        {
          id: SEED_STATUS_IDS.done,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'Done',
          category: 'COMPLETED',
          color: '#22C55E',
          position: 4,
        },
        {
          id: SEED_STATUS_IDS.cancelled,
          organizationId: SEED_ORG_ID,
          projectId: SEED_PROJECT_ID,
          name: 'Cancelled',
          category: 'CANCELLED',
          color: '#EF4444',
          position: 5,
        },
      ])
      .onConflictDoNothing();

    // A few work items so the board/list/My-Work are non-empty on first run.
    await db
      .insert(workItems)
      .values([
        {
          id: '0193b3a0-0000-7000-8000-000000000020',
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          number: 1,
          title: 'Set up the project board',
          statusId: SEED_STATUS_IDS.todo,
          priority: 'MEDIUM',
          reporterId: SEED_USER_ID,
          assigneeId: SEED_USER_ID,
          position: '1024',
        },
        {
          id: '0193b3a0-0000-7000-8000-000000000021',
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          number: 2,
          title: 'Capture work in seconds with quick-add',
          statusId: SEED_STATUS_IDS.inProgress,
          priority: 'HIGH',
          reporterId: SEED_USER_ID,
          assigneeId: SEED_USER_ID,
          position: '2048',
        },
        {
          id: '0193b3a0-0000-7000-8000-000000000022',
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          number: 3,
          title: 'Triage the inbox',
          statusId: SEED_STATUS_IDS.todo,
          priority: 'LOW',
          reporterId: SEED_USER_ID,
          position: '3072',
        },
      ])
      .onConflictDoNothing();

    // The counter reflects the highest minted number (never recycled, FR-WI-002).
    await db
      .insert(projectCounters)
      .values({ projectId: SEED_PROJECT_ID, organizationId: SEED_ORG_ID, lastNumber: 3 })
      .onConflictDoNothing();
  } finally {
    await pool.end();
  }
}

// `node dist/seed.js` / `tsx src/seed.ts`
if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seed complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
