import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type Database,
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  runMigrations,
  seed,
  statuses,
  users,
  workItems,
  workspaces,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { type StartedPostgres, startPostgres } from '../common/testing/postgres';
import { createSession } from './mcp-session';
import { McpToolDispatcher } from './tools/tool-dispatch';

/**
 * MCP cross-tenant isolation (T068, US4, SC-004, Principle II). An agent authenticated to org A can
 * never reach org B's data through ANY tool: a foreign id yields NOT_FOUND, and zero of B's rows are
 * read or mutated. Tenant is the PAT principal's org, re-established per call — never a tool argument.
 */
const ORG_B = '0193b3a0-0000-7000-8000-0000000000d1';
const WS_B = '0193b3a0-0000-7000-8000-0000000000d2';
const USER_B = '0193b3a0-0000-7000-8000-0000000000d3';
const PROJECT_B = '0193b3a0-0000-7000-8000-0000000000d4';
const STATUS_B = '0193b3a0-0000-7000-8000-0000000000d5';
const ITEM_B = '0193b3a0-0000-7000-8000-0000000000d6';

async function seedOrgB(db: Database): Promise<void> {
  await db.insert(organizations).values({ id: ORG_B, name: 'Org B', slug: 'org-b-mcp' });
  await db.insert(workspaces).values({ id: WS_B, organizationId: ORG_B, name: 'B', slug: 'b-mcp' });
  await db
    .insert(users)
    .values({ id: USER_B, organizationId: ORG_B, email: 'b-mcp@b.test', name: 'B' });
  await db.insert(memberships).values({ organizationId: ORG_B, userId: USER_B, role: 'OWNER' });
  await db.insert(projects).values({
    id: PROJECT_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    name: 'B Secret',
    keyPrefix: 'BSEC',
  });
  await db
    .insert(projectMembers)
    .values({ organizationId: ORG_B, projectId: PROJECT_B, userId: USER_B, role: 'ADMIN' });
  await db.insert(statuses).values({
    id: STATUS_B,
    organizationId: ORG_B,
    projectId: PROJECT_B,
    name: 'To Do',
    category: 'UNSTARTED',
    position: 1,
  });
  await db
    .insert(projectCounters)
    .values({ projectId: PROJECT_B, organizationId: ORG_B, lastNumber: 1 });
  await db.insert(workItems).values({
    id: ITEM_B,
    organizationId: ORG_B,
    workspaceId: WS_B,
    projectId: PROJECT_B,
    number: 1,
    title: 'ORG-B-SECRET',
    statusId: STATUS_B,
    priority: 'HIGH',
  });
}

const principalA = {
  userId: SEED_USER_ID,
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  role: 'OWNER' as const,
  isOrgAdmin: true,
  scopes: ['*'],
  isApiToken: true,
};

describe('MCP tenant isolation (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let app: INestApplication;
  let dispatcher: McpToolDispatcher;

  beforeAll(async () => {
    pg = await startPostgres();
    process.env.DATABASE_URL = pg.url;
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    await seedOrgB(handle.db);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dispatcher = app.get(McpToolDispatcher);
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
    Reflect.deleteProperty(process.env, 'DATABASE_URL');
    await pg?.stop();
  });

  const code = async (name: string, args: unknown): Promise<string> => {
    try {
      await dispatcher.dispatch(createSession(principalA), name, args);
      return 'OK';
    } catch (err) {
      return (err as { code?: string }).code ?? 'UNKNOWN';
    }
  };

  it("denies every read/mutation of org B's item from org A (NOT_FOUND, no leak)", async () => {
    expect(await code('get_issue', { id: ITEM_B })).toBe('NOT_FOUND');
    expect(await code('list_issue_activity', { id: ITEM_B })).toBe('NOT_FOUND');
    expect(await code('update_issue', { id: ITEM_B, version: 1, title: 'hijacked' })).toBe(
      'NOT_FOUND',
    );
    expect(await code('delete_issue', { id: ITEM_B })).toBe('NOT_FOUND');

    // 0 cross-tenant writes: B's row is untouched (title + presence intact).
    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, ITEM_B));
    expect(row?.title).toBe('ORG-B-SECRET');
    expect(row?.organizationId).toBe(ORG_B);
  });

  it("get_project on org B's project is NOT_FOUND", async () => {
    expect(await code('get_project', { id: PROJECT_B })).toBe('NOT_FOUND');
  });
});
