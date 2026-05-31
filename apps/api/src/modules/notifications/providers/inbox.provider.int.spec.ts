import {
  type DbHandle,
  SEED_ORG_ID,
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
import { dedupeKey } from '../domain/dedupe.policy';
import { NotificationsRepository } from '../repositories/notifications.repository';
import { InboxProvider } from './inbox.provider';

/**
 * Integration test against REAL PostgreSQL (T104, FR-NOTIF-002). Proves the inbox state
 * machine: unread count, snooze re-surfaces after `snoozed_until`, archive hides.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };
const ENTITY = '0193b3a0-0000-7000-8000-000000000020';

/** Mutable clock so we can advance time across the snooze boundary. */
let nowValue = new Date('2026-05-31T12:00:00.000Z');
const clock: Clock = { now: () => nowValue };

describe('InboxProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: NotificationsRepository;
  let inbox: InboxProvider;
  let ids: string[] = [];

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new NotificationsRepository(handle.db, tenant);
    inbox = new InboxProvider(repo, clock, tenant);

    // Three unread notifications for the seed user.
    await tenant.run(CTX, () =>
      repo.insertDeduped(
        ['ASSIGNED', 'COMMENTED', 'MENTIONED'].map((type, i) => ({
          recipientId: SEED_USER_ID,
          type: type as 'ASSIGNED' | 'COMMENTED' | 'MENTIONED',
          entityType: 'work_item',
          entityId: ENTITY,
          actorId: null,
          dedupeKey: dedupeKey(SEED_USER_ID, ENTITY, type as 'ASSIGNED', `seed-${i}`),
          payload: {},
        })),
      ),
    );
    ids = (
      await tenant.run(CTX, () => repo.listForRecipient(SEED_USER_ID, 'all', 50, clock.now()))
    ).map((r) => r.id);
    expect(ids).toHaveLength(3);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('counts unread and lists them', async () => {
    expect(await tenant.run(CTX, () => inbox.unreadCount())).toBe(3);
    const page = await tenant.run(CTX, () => inbox.list({ state: 'unread', limit: 50 }));
    expect(page.rows).toHaveLength(3);
  });

  it('marking one read drops the unread count and hides it from the unread list', async () => {
    await tenant.run(CTX, () => inbox.update(ids[0] as string, { read: true }));
    expect(await tenant.run(CTX, () => inbox.unreadCount())).toBe(2);
    const unread = await tenant.run(CTX, () => inbox.list({ state: 'unread', limit: 50 }));
    expect(unread.rows.map((r) => r.id)).not.toContain(ids[0]);
    // 'all' still shows it.
    const all = await tenant.run(CTX, () => inbox.list({ state: 'all', limit: 50 }));
    expect(all.rows).toHaveLength(3);
  });

  it('snooze hides from unread, shows under snoozed, then re-surfaces after snoozed_until', async () => {
    const until = new Date('2026-06-01T09:00:00.000Z');
    await tenant.run(CTX, () =>
      inbox.update(ids[1] as string, { snoozedUntil: until.toISOString() }),
    );
    // Still "now" = 12:00 on the 31st → snoozed, not unread.
    expect(await tenant.run(CTX, () => inbox.unreadCount())).toBe(1);
    const snoozed = await tenant.run(CTX, () => inbox.list({ state: 'snoozed', limit: 50 }));
    expect(snoozed.rows.map((r) => r.id)).toContain(ids[1]);

    // Advance past snoozed_until → it re-surfaces in unread.
    nowValue = new Date('2026-06-01T10:00:00.000Z');
    expect(await tenant.run(CTX, () => inbox.unreadCount())).toBe(2);
    const unread = await tenant.run(CTX, () => inbox.list({ state: 'unread', limit: 50 }));
    expect(unread.rows.map((r) => r.id)).toContain(ids[1]);
    nowValue = new Date('2026-05-31T12:00:00.000Z'); // reset for the next test
  });

  it('archive hides from unread and surfaces under archived', async () => {
    await tenant.run(CTX, () => inbox.update(ids[2] as string, { archived: true }));
    const unread = await tenant.run(CTX, () => inbox.list({ state: 'unread', limit: 50 }));
    expect(unread.rows.map((r) => r.id)).not.toContain(ids[2]);
    const archived = await tenant.run(CTX, () => inbox.list({ state: 'archived', limit: 50 }));
    expect(archived.rows.map((r) => r.id)).toContain(ids[2]);
  });

  it('throws NotFound when updating a notification the recipient does not own', async () => {
    await expect(
      tenant.run(CTX, () => inbox.update('0193b3a0-0000-7000-8000-0000000000ff', { read: true })),
    ).rejects.toThrow();
  });
});
