import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import type { Principal } from '../common/auth/principal';
import { TenantContextService } from '../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../common/testing/postgres';
import { ApiTokensProvider } from '../modules/identity/providers/api-tokens.provider';
import { McpAuth } from './mcp-auth';

/**
 * Integration test for MCP PAT auth (T065, US4, FR-MCP-002, SC-004). A minted PAT resolves to its
 * holder's principal (with its scopes), a REVOKED PAT is denied mid-session, and the resolved scope
 * is exactly what was granted — so scope ∩ role can default-deny downstream. Reuses the M0
 * `TokenVerifier` (one auth, not two).
 */
const OWNER: Principal = {
  userId: SEED_USER_ID,
  organizationId: SEED_ORG_ID,
  role: 'OWNER',
  isOrgAdmin: true,
  scopes: [],
};

describe('McpAuth (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;
  let auth: McpAuth;
  let tokens: ApiTokensProvider;
  let tenant: TenantContextService;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    auth = app.get(McpAuth);
    tokens = app.get(ApiTokensProvider);
    tenant = app.get(TenantContextService);
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
    Reflect.deleteProperty(process.env, 'DATABASE_URL');
    await pg?.stop();
  });

  const ctx = { organizationId: SEED_ORG_ID, userId: SEED_USER_ID };

  it('resolves a minted PAT to the holder principal with its granted scopes', async () => {
    const minted = await tenant.run(ctx, () =>
      tokens.issue(OWNER, { name: 'agent', type: 'MCP', scopes: ['work:read'] }),
    );
    const principal = await auth.resolvePrincipal(`Bearer ${minted.secret}`);
    expect(principal.userId).toBe(SEED_USER_ID);
    expect(principal.organizationId).toBe(SEED_ORG_ID);
    expect(principal.role).toBe('OWNER');
    expect(principal.scopes).toEqual(['work:read']);
    // A bare token (stdio `RYTASK_PAT`) resolves identically.
    expect((await auth.resolvePrincipal(minted.secret)).userId).toBe(SEED_USER_ID);
  });

  it('denies a revoked PAT (mid-session)', async () => {
    const minted = await tenant.run(ctx, () =>
      tokens.issue(OWNER, { name: 'short-lived', type: 'MCP', scopes: ['*'] }),
    );
    expect((await auth.resolvePrincipal(`Bearer ${minted.secret}`)).userId).toBe(SEED_USER_ID);
    await tenant.run(ctx, () => tokens.revoke(OWNER, minted.id));
    await expect(auth.resolvePrincipal(`Bearer ${minted.secret}`)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });

  it('denies a garbage / missing credential', async () => {
    await expect(auth.resolvePrincipal('Bearer not-a-real-token')).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    await expect(auth.resolvePrincipal(undefined)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });
});
