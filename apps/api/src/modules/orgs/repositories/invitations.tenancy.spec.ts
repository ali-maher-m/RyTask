import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  organizations,
  runMigrations,
  seed,
  users,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { InvitationsRepository } from './invitations.repository';

/**
 * Cross-tenant isolation for `invitations` (T063, FR-TEN-001/003, SC-008). Org A can never
 * list, find-by-email, or revoke Org B's invites through the tenant-scoped paths.
 * `findByTokenHash` is a documented global exception — the public preview/accept routes run
 * before any tenant context exists and the hash (derived from the secret token) is the key.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d2';

const ctxA = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };
const ctxB = { organizationId: ORG_B, userId: USER_B };

const NOW = new Date('2026-06-02T00:00:00.000Z');
const future = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

describe('invitations tenancy isolation', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: InvitationsRepository;
  let inviteAId: string;
  let inviteBId: string;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    repo = new InvitationsRepository(handle.db, tenant);

    await handle.db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-inv' });
    await handle.db
      .insert(users)
      .values({ id: USER_B, organizationId: ORG_B, email: 'b@b.test', name: 'B' });

    const a = await repo.create({
      organizationId: SEED_ORG_ID,
      email: 'invitee@a.test',
      role: 'MEMBER',
      tokenHash: 'hash-a',
      invitedByUserId: SEED_USER_ID,
      expiresAt: future,
    });
    const b = await repo.create({
      organizationId: ORG_B,
      email: 'invitee@b.test',
      role: 'ADMIN',
      tokenHash: 'hash-b',
      invitedByUserId: USER_B,
      expiresAt: future,
    });
    inviteAId = a.id;
    inviteBId = b.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('lists only its own pending invites', async () => {
    const a = await tenant.run(ctxA, () => repo.listPending(NOW));
    expect(a.map((i) => i.id)).toEqual([inviteAId]);

    const b = await tenant.run(ctxB, () => repo.listPending(NOW));
    expect(b.map((i) => i.id)).toEqual([inviteBId]);
  });

  it('never finds another org’s live email invite', async () => {
    expect(
      await tenant.run(ctxA, () => repo.findLiveByEmail('invitee@a.test', NOW)),
    ).not.toBeNull();
    expect(await tenant.run(ctxA, () => repo.findLiveByEmail('invitee@b.test', NOW))).toBeNull();
    expect(await tenant.run(ctxB, () => repo.findLiveByEmail('invitee@a.test', NOW))).toBeNull();
  });

  it('cannot revoke another org’s invite', async () => {
    expect(await tenant.run(ctxA, () => repo.revoke(inviteBId, NOW))).toBe(false);
    // Org B's invite is untouched.
    expect((await tenant.run(ctxB, () => repo.listPending(NOW))).map((i) => i.id)).toEqual([
      inviteBId,
    ]);
  });

  it('findByTokenHash is the documented global exception (public accept path)', async () => {
    // The secret hash is the key; resolution is intentionally cross-context (pre-ALS).
    expect((await repo.findByTokenHash('hash-a'))?.id).toBe(inviteAId);
    expect((await repo.findByTokenHash('hash-b'))?.id).toBe(inviteBId);
  });
});
