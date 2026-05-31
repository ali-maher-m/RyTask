import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  organizations,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { dedupeKey } from '../domain/dedupe.policy';
import { NotificationsRepository } from './notifications.repository';

/**
 * Cross-tenant isolation for `notifications` (T105, FR-TEN-003, SC-014). Org A can never
 * read/write Org B's inbox rows — enforced structurally by TenantScopedRepository,
 * proven against real Postgres.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000e1';
const USER_B = '0193b3a0-0000-7000-8000-0000000000e3';
const ENTITY = '0193b3a0-0000-7000-8000-000000000020';

const ctxA = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };
const NOW = new Date('2026-05-31T12:00:00.000Z');

describe('notifications tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: NotificationsRepository;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url); // org A
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new NotificationsRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-ntf' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@ntf.test', name: 'B' });

    await tenant.run(ctxA, () =>
      repo.insertDeduped([
        {
          recipientId: SEED_USER_ID,
          type: 'COMMENTED',
          entityType: 'work_item',
          entityId: ENTITY,
          actorId: null,
          dedupeKey: dedupeKey(SEED_USER_ID, ENTITY, 'COMMENTED', `${SEED_ORG_ID}-a`),
          payload: { key: 'RY-1' },
        },
      ]),
    );
    await tenant.run(ctxB, () =>
      repo.insertDeduped([
        {
          recipientId: USER_B,
          type: 'COMMENTED',
          entityType: 'work_item',
          entityId: ENTITY,
          actorId: null,
          dedupeKey: dedupeKey(USER_B, ENTITY, 'COMMENTED', `${ORG_B}-b`),
          payload: { key: 'OB-1' },
        },
      ]),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('each org sees only its own inbox rows', async () => {
    const a = await tenant.run(ctxA, () => repo.listForRecipient(SEED_USER_ID, 'all', 50, NOW));
    const b = await tenant.run(ctxB, () => repo.listForRecipient(USER_B, 'all', 50, NOW));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.recipientId).toBe(SEED_USER_ID);
    expect(b[0]?.recipientId).toBe(USER_B);
  });

  it('never lists another org’s notifications even by the same recipient query', async () => {
    // Org A querying org B's recipient id returns nothing (tenant scope wins).
    expect(
      await tenant.run(ctxA, () => repo.listForRecipient(USER_B, 'all', 50, NOW)),
    ).toHaveLength(0);
    expect(
      await tenant.run(ctxB, () => repo.listForRecipient(SEED_USER_ID, 'all', 50, NOW)),
    ).toHaveLength(0);
  });

  it('unread counts are tenant-scoped', async () => {
    expect(await tenant.run(ctxA, () => repo.unreadCount(SEED_USER_ID, NOW))).toBe(1);
    expect(await tenant.run(ctxB, () => repo.unreadCount(USER_B, NOW))).toBe(1);
    // Cross-org recipient → 0.
    expect(await tenant.run(ctxA, () => repo.unreadCount(USER_B, NOW))).toBe(0);
  });

  it('update is tenant-scoped — org A cannot mutate org B’s notification', async () => {
    const bRow = (await tenant.run(ctxB, () => repo.listForRecipient(USER_B, 'all', 50, NOW)))[0];
    expect(bRow).toBeDefined();
    const updated = await tenant.run(ctxA, () =>
      repo.update(bRow?.id ?? '', USER_B, { readAt: NOW }),
    );
    expect(updated).toBeNull(); // org A's scope excludes org B's row
  });
});
