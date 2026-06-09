import { createDb } from './client';
import {
  timers,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  statuses,
  timeLogs,
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

/** Time-tracking demo ids (M2) — fixed so `make seed` yields a visible plan-vs-actual meter. */
export const SEED_TIME_LOG_IDS = {
  underA: '0193b3a0-0000-7000-8000-000000000030', // item RY-1, manual, planned
  underB: '0193b3a0-0000-7000-8000-000000000031', // item RY-1, timer, planned
  overA: '0193b3a0-0000-7000-8000-000000000032', // item RY-2, manual, interruption (overridden)
  overB: '0193b3a0-0000-7000-8000-000000000033', // item RY-2, timer, planned
} as const;
export const SEED_TIMER_ID = '0193b3a0-0000-7000-8000-000000000040'; // running timer on item RY-3

/**
 * Dev credentials for the seeded founder (research D16). The hash is a real argon2id hash of
 * {@link SEED_USER_PASSWORD}, precomputed so `packages/db` needs no argon2 dependency; the
 * API's verifier reads the salt/params from the hash string. Keeps `docker compose up` a
 * working signed-in-Owner demo and lets login tests sign in (`founder@rytask.local`).
 */
export const SEED_USER_PASSWORD = 'rytask-dev-password';
const SEED_USER_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$CRsLoRcApM4Y9sKytJ8WAA$bLEYxElsrPq0XE6q199OUBDo0LDSCS1bioYiTXYpwZ0';

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
        passwordHash: SEED_USER_PASSWORD_HASH,
        emailVerifiedAt: new Date(),
      })
      .onConflictDoNothing();

    // The founder is the OWNER of the org (M0, FR-RBAC-001) so RBAC + the demo work.
    await db
      .insert(memberships)
      .values({
        organizationId: SEED_ORG_ID,
        userId: SEED_USER_ID,
        role: 'OWNER',
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
          // M2 — an 8h estimate (interpreted as hours, research D5) so the meter has a planned tick.
          estimateValue: '8',
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
          // M2 — a small 2h estimate so the seeded logs push this item over budget (red meter).
          estimateValue: '2',
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

    // M2 (data-model §7) — a few finalized entries + one running timer so `make seed` yields a
    // visible plan-vs-actual meter: RY-1 logs under its 8h estimate (honey, under-budget), RY-2 logs
    // over its 2h estimate (red, over-budget, with a planned/interruption split), and RY-3 has the
    // founder's single running timer (the one-active-timer invariant). Timestamps are relative so the
    // "my time today / this week" view is populated; ids are fixed (seed range, onConflictDoNothing).
    const nowMs = Date.now();
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const at = (msAgo: number): Date => new Date(nowMs - msAgo);
    const RY_1 = '0193b3a0-0000-7000-8000-000000000020';
    const RY_2 = '0193b3a0-0000-7000-8000-000000000021';
    const RY_3 = '0193b3a0-0000-7000-8000-000000000022';

    await db
      .insert(timeLogs)
      .values([
        {
          // RY-1 — 2h, planned, logged after the fact.
          id: SEED_TIME_LOG_IDS.underA,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          workItemId: RY_1,
          userId: SEED_USER_ID,
          startedAt: at(4 * HOUR),
          endedAt: at(2 * HOUR),
          durationSeconds: 7200,
          note: 'Drafted the columns',
          source: 'MANUAL',
          classification: 'PLANNED',
        },
        {
          // RY-1 — 1h15m, planned, from a timer.
          id: SEED_TIME_LOG_IDS.underB,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          workItemId: RY_1,
          userId: SEED_USER_ID,
          startedAt: at(105 * MIN),
          endedAt: at(30 * MIN),
          durationSeconds: 4500,
          source: 'TIMER',
          classification: 'PLANNED',
        },
        {
          // RY-2 — 1h30m, an interruption (classification overridden) logged yesterday.
          id: SEED_TIME_LOG_IDS.overA,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          workItemId: RY_2,
          userId: SEED_USER_ID,
          startedAt: at(26 * HOUR),
          endedAt: at(24 * HOUR + 30 * MIN),
          durationSeconds: 5400,
          note: 'Urgent customer ping',
          source: 'MANUAL',
          classification: 'INTERRUPTION',
          classificationOverridden: true,
        },
        {
          // RY-2 — 1h, planned, from a timer; pushes RY-2 over its 2h estimate (red meter).
          id: SEED_TIME_LOG_IDS.overB,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          projectId: SEED_PROJECT_ID,
          workItemId: RY_2,
          userId: SEED_USER_ID,
          startedAt: at(3 * HOUR),
          endedAt: at(2 * HOUR),
          durationSeconds: 3600,
          source: 'TIMER',
          classification: 'PLANNED',
        },
      ])
      .onConflictDoNothing();

    // The founder's single running timer (server CLOCK is the source of truth — the UI derives elapsed).
    await db
      .insert(timers)
      .values({
        id: SEED_TIMER_ID,
        organizationId: SEED_ORG_ID,
        workspaceId: SEED_WORKSPACE_ID,
        workItemId: RY_3,
        userId: SEED_USER_ID,
        startedAt: at(25 * MIN),
        note: 'Triaging now',
      })
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
