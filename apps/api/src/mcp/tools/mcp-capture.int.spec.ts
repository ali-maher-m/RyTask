import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_PROJECT_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  createDb,
  runMigrations,
  seed,
  workItems,
} from '@rytask/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';
import { type StartedPostgres, startPostgres } from '../../common/testing/postgres';
import { createSession } from '../mcp-session';
import { McpToolDispatcher } from './tool-dispatch';

/**
 * Integration test for MCP capture (T066, US4, FR-MCP-006, capture-source.md §4). `create_issue` and
 * `quick_add_issue` dispatch through the SAME `WorkItemsService.create` the web/Slack use, recording
 * `source = 'MCP'`, attributed to the token user, with unresolved quick-add tokens surfaced in `meta`.
 */
const principal = {
  userId: SEED_USER_ID,
  organizationId: SEED_ORG_ID,
  workspaceId: SEED_WORKSPACE_ID,
  role: 'OWNER' as const,
  isOrgAdmin: true,
  scopes: ['*'],
  isApiToken: true,
};

describe('MCP capture (integration)', () => {
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

  it('create_issue records source=MCP attributed to the token user', async () => {
    const session = createSession(principal);
    const res = (await dispatcher.dispatch(session, 'create_issue', {
      projectId: SEED_PROJECT_ID,
      title: 'Driven by an agent',
    })) as { data: { id: string }; meta: { unresolved: unknown[] } };

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, res.data.id));
    expect(row?.source).toBe('MCP');
    expect(row?.reporterId).toBe(SEED_USER_ID);
    expect(row?.title).toBe('Driven by an agent');
  });

  it('quick_add_issue parses the line and surfaces unresolved tokens in meta', async () => {
    const session = createSession(principal);
    const res = (await dispatcher.dispatch(session, 'quick_add_issue', {
      projectId: SEED_PROJECT_ID,
      text: 'Triage inbound @ghostuser !high',
    })) as {
      data: { id: string; priority: string };
      meta: { unresolved: Array<{ token: string }> };
    };

    const [row] = await handle.db.select().from(workItems).where(eq(workItems.id, res.data.id));
    expect(row?.source).toBe('MCP');
    expect(row?.priority).toBe('HIGH');
    expect(res.meta.unresolved.some((u) => u.token === '@ghostuser')).toBe(true);
  });
});
