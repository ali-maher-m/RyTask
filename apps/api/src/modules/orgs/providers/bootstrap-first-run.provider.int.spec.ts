import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  createDb,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  statuses,
  users,
  workspaces,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { authConfig } from '../../../common/config/auth.config';
import { Argon2Hasher } from '../../../common/ports/argon2-hasher.adapter';
import { systemClock } from '../../../common/ports/clock.port';
import { systemIdGenerator } from '../../../common/ports/id-generator.port';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { AuthService } from '../../identity/services/auth.service';
import { TokenSigner } from '../../identity/services/token-signer.service';
import { SessionsRepository } from '../../identity/repositories/sessions.repository';
import { BootstrapRepository } from '../repositories/bootstrap.repository';
import { BootstrapFirstRunProvider } from './bootstrap-first-run.provider';

/**
 * Integration test against REAL PostgreSQL (T031, US1, FR-AUTH-010). Proves first-run
 * atomically creates org + owner (argon2, verified) + OWNER membership + default workspace +
 * starter project (six categorized statuses, counter, owner ADMIN project membership) and
 * signs the owner in — then self-closes (re-run → 409). Runs on an EMPTY (unseeded) DB.
 */
describe('BootstrapFirstRunProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let provider: BootstrapFirstRunProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    const tenant = new TenantContextService();
    const bootstrapRepo = new BootstrapRepository(handle.db, tenant);
    const sessionsRepo = new SessionsRepository(handle.db, tenant);
    const authService = new AuthService(
      new TokenSigner(cfg),
      sessionsRepo,
      new TokenHasher(cfg),
      systemClock,
      systemIdGenerator,
      cfg,
    );
    provider = new BootstrapFirstRunProvider(
      bootstrapRepo,
      new Argon2Hasher(cfg),
      authService,
      systemClock,
      new EventEmitter2(),
    );
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('is available on an empty DB and creates a signed-in Owner with a starter project', async () => {
    expect(await provider.isAvailable()).toBe(true);

    const result = await provider.bootstrap({
      organizationName: 'Acme Inc',
      ownerName: 'Ada Owner',
      ownerEmail: 'ada@acme.test',
      ownerPassword: 'super-secret-pw',
    });

    // Owner is signed in.
    expect(result.accessToken).toBeTypeOf('string');
    expect(result.refreshToken).toBeTypeOf('string');
    expect(result.user.email).toBe('ada@acme.test');
    expect(result.user.emailVerified).toBe(true);
    expect(result.expiresIn).toBeLessThanOrEqual(900);

    // Exactly one org, with seeded settings + a slug.
    const orgs = await handle.db.select().from(organizations);
    expect(orgs).toHaveLength(1);
    const org = orgs[0]!;
    expect(org.name).toBe('Acme Inc');
    expect(org.slug).toBe('acme-inc');
    expect(org.settings).toEqual({ allowPublicSignup: false });

    // Owner user: argon2 hash (not plaintext) + verified.
    const [owner] = await handle.db.select().from(users).where(eq(users.email, 'ada@acme.test'));
    expect(owner?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(owner?.passwordHash).not.toContain('super-secret-pw');
    expect(owner?.emailVerifiedAt).not.toBeNull();

    // OWNER membership.
    const [membership] = await handle.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, owner!.id));
    expect(membership?.role).toBe('OWNER');

    // Default workspace.
    const ws = await handle.db.select().from(workspaces).where(eq(workspaces.organizationId, org.id));
    expect(ws).toHaveLength(1);
    expect(ws[0]!.slug).toBe('default');

    // Starter project + counter + 6 statuses + owner ADMIN project membership.
    const projs = await handle.db.select().from(projects).where(eq(projects.organizationId, org.id));
    expect(projs).toHaveLength(1);
    const project = projs[0]!;
    // "Acme Inc" → "ACMEINC" → first 5 chars (starterKeyPrefix caps at 5).
    expect(project.keyPrefix).toBe('ACMEI');
    expect(project.keyPrefix).toMatch(/^[A-Z][A-Z0-9]{1,9}$/);

    const [counter] = await handle.db
      .select()
      .from(projectCounters)
      .where(eq(projectCounters.projectId, project.id));
    expect(counter?.lastNumber).toBe(0);

    const sts = await handle.db.select().from(statuses).where(eq(statuses.projectId, project.id));
    expect(sts.map((s) => s.name).sort()).toEqual(
      ['Backlog', 'Cancelled', 'Done', 'In Progress', 'Review', 'To Do'].sort(),
    );

    const [pm] = await handle.db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, project.id));
    expect(pm?.role).toBe('ADMIN');
  });

  it('self-closes after bootstrap (re-run → 409, no second org)', async () => {
    expect(await provider.isAvailable()).toBe(false);
    await expect(
      provider.bootstrap({
        organizationName: 'Second Org',
        ownerName: 'Eve',
        ownerEmail: 'eve@evil.test',
        ownerPassword: 'another-pw-123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const orgs = await handle.db.select().from(organizations);
    expect(orgs).toHaveLength(1);
  });
});
