import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { authConfig } from '../../../common/config/auth.config';
import { systemClock } from '../../../common/ports/clock.port';
import { patHasPermission } from '../../../common/rbac/permissions';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { MembershipsRepository } from '../../orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../orgs/repositories/workspaces.repository';
import { AccessServiceImpl } from '../../orgs/services/access.service';
import { ApiTokensRepository } from '../repositories/api-tokens.repository';
import { TokenSigner } from '../services/token-signer.service';
import { TokenVerifier } from '../services/token-verifier.service';
import { ApiTokensProvider } from './api-tokens.provider';

/**
 * Integration test against REAL PostgreSQL (T092, US7, FR-AUTH-007, SC-012/SC-002). Proves a
 * minted PAT is hash-at-rest + shown once, that the verifier resolves it to the holder's
 * principal (role + scopes) and stamps `lastUsedAt`, that revocation rejects it, and that an
 * expired token is rejected — with scope ∩ role honored.
 */
const founder: Principal = { userId: SEED_USER_ID, organizationId: SEED_ORG_ID };

describe('ApiTokens provider + verifier (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let repo: ApiTokensRepository;
  let provider: ApiTokensProvider;
  let verifier: TokenVerifier;
  let tokenHasher: TokenHasher;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const cfg = authConfig();
    tenant = new TenantContextService();
    tokenHasher = new TokenHasher(cfg);
    repo = new ApiTokensRepository(handle.db, tenant);
    const access = new AccessServiceImpl(
      new MembershipsRepository(handle.db, tenant),
      new WorkspacesRepository(handle.db, tenant),
      new OrganizationsRepository(handle.db, tenant),
      tenant,
    );
    provider = new ApiTokensProvider(repo, tokenHasher, systemClock, new EventEmitter2());
    verifier = new TokenVerifier(new TokenSigner(cfg), repo, tokenHasher, access, systemClock);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('mints a PAT shown once, hashed at rest', async () => {
    const minted = await provider.issue(founder, {
      name: 'CI token',
      type: 'PAT',
      scopes: ['work:read'],
    });
    expect(minted.secret).toMatch(/^rytask_pat_/);

    const row = await repo.findByHash(tokenHasher.hash(minted.secret));
    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(minted.secret); // stored as a hash, not plaintext
    expect(row?.tokenHash).toBe(tokenHasher.hash(minted.secret));

    // Listing never exposes the secret.
    const listed = await tenant.run(founder, () => provider.list(founder));
    expect(listed).toHaveLength(1);
    expect((listed[0] as { secret?: string }).secret).toBeUndefined();
    expect(listed[0]?.scopes).toEqual(['work:read']);
  });

  it('verifies the secret → holder principal (role + scopes), stamping lastUsedAt', async () => {
    const minted = await provider.issue(founder, {
      name: 'verify token',
      type: 'PAT',
      scopes: ['work:read'],
    });
    const principal = await verifier.verify(`Bearer ${minted.secret}`);
    expect(principal).not.toBeNull();
    if (!principal?.role) {
      throw new Error('expected a verified principal with a role');
    }
    expect(principal.userId).toBe(SEED_USER_ID);
    expect(principal.role).toBe('OWNER');
    expect(principal.scopes).toEqual(['work:read']);

    // scope ∩ role: in-scope allowed, out-of-scope denied even though OWNER could.
    expect(patHasPermission(principal.role, principal.scopes ?? [], 'work:read')).toBe(true);
    expect(patHasPermission(principal.role, principal.scopes ?? [], 'work:write')).toBe(false);

    const row = await repo.findByHash(tokenHasher.hash(minted.secret));
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('rejects a revoked token', async () => {
    const minted = await provider.issue(founder, { name: 'revoke me', type: 'PAT', scopes: [] });
    const id = await idOf(minted.secret);
    await tenant.run(founder, () => provider.revoke(founder, id));
    expect(await verifier.verify(`Bearer ${minted.secret}`)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const secret = tokenHasher.generate('rytask_pat_');
    await repo.create({
      organizationId: SEED_ORG_ID,
      userId: SEED_USER_ID,
      type: 'PAT',
      name: 'expired',
      tokenHash: tokenHasher.hash(secret),
      scopes: [],
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await verifier.verify(`Bearer ${secret}`)).toBeNull();
  });

  async function idOf(secret: string): Promise<string> {
    const row = await repo.findByHash(tokenHasher.hash(secret));
    if (!row) {
      throw new Error('token not found');
    }
    return row.id;
  }
});
