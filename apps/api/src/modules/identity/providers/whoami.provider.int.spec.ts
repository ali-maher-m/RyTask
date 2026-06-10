import { UnauthorizedException } from '@nestjs/common';
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
import type { Principal } from '../../../common/auth/principal';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { MembershipsRepository } from '../../orgs/repositories/memberships.repository';
import { OrganizationsRepository } from '../../orgs/repositories/organizations.repository';
import { WorkspacesRepository } from '../../orgs/repositories/workspaces.repository';
import { AccessServiceImpl } from '../../orgs/services/access.service';
import { UsersRepository } from '../repositories/users.repository';
import { WhoamiProvider } from './whoami.provider';

/**
 * Integration test against REAL PostgreSQL (US2, FR-INT-MCP-001). Proves `whoami` resolves the
 * verified principal into user + org + active workspace + role + scopes + accessible
 * workspaces, and refuses a principal whose user is missing or whose role is absent (401).
 */
const founder: Principal = {
  userId: SEED_USER_ID,
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  role: 'OWNER',
  scopes: [],
};

describe('WhoamiProvider (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let provider: WhoamiProvider;

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    const tenant = new TenantContextService();
    const access = new AccessServiceImpl(
      new MembershipsRepository(handle.db, tenant),
      new WorkspacesRepository(handle.db, tenant),
      new OrganizationsRepository(handle.db, tenant),
      tenant,
    );
    provider = new WhoamiProvider(new UsersRepository(handle.db, tenant), access);
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  it('resolves the founder principal → user, org, active workspace, role, workspaces', async () => {
    const me = await provider.build(founder);
    expect(me.user.email).toBe('founder@rytask.local');
    expect(me.organizationId).toBe(SEED_ORG_ID);
    expect(me.activeWorkspaceId).toBe(SEED_WORKSPACE_ID);
    expect(me.role).toBe('OWNER');
    expect(me.scopes).toEqual([]);
    expect(me.workspaces.some((w) => w.id === SEED_WORKSPACE_ID)).toBe(true);
  });

  it('a null active workspace is carried through', async () => {
    const me = await provider.build({ ...founder, workspaceId: undefined });
    expect(me.activeWorkspaceId).toBeNull();
  });

  it('refuses a principal whose user does not exist → 401', async () => {
    await expect(
      provider.build({ ...founder, userId: '0193b3a0-0000-7000-8000-0000000000ff' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a principal with no role → 401', async () => {
    await expect(provider.build({ ...founder, role: undefined })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
