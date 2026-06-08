import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, makeSession } from '../mcp.testkit';

/**
 * Contract test for MCP list/search pagination (T067, US4.3, FR-MCP-005, research D14). `list_issues`
 * and `search` return the `{ items, nextCursor }` page envelope — paged, NEVER silently truncated —
 * and honor `fields` projection (token-budget trimming) and the keyset `cursor`/`filter`/`limit`.
 */
const row = {
  id: 'wi-1',
  title: 'login bug',
  description: 'long…',
  priority: 'HIGH',
  source: 'MCP',
};

const workItems = {
  list: vi.fn(async () => ({
    data: [row],
    pageInfo: { nextCursor: 'opaque-cursor-2', hasNextPage: true },
  })),
};
const search = {
  search: vi.fn(async () => ({ data: [{ type: 'work_item', id: 'wi-1', title: 'login bug' }] })),
};

const dispatcher = buildDispatcher({ workItems, search });
const owner = makeSession();

describe('MCP pagination (contract)', () => {
  it('list_issues returns a cursored page (next cursor preserved, not truncated)', async () => {
    const res = (await dispatcher.dispatch(owner, 'list_issues', { limit: 1 })) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(res.items).toEqual([row]);
    expect(res.nextCursor).toBe('opaque-cursor-2');
  });

  it('threads filter + cursor + limit to the underlying keyset service', async () => {
    await dispatcher.dispatch(owner, 'list_issues', { filter: 'enc', cursor: 'c1', limit: 25 });
    expect(workItems.list).toHaveBeenLastCalledWith({ filter: 'enc', cursor: 'c1', limit: 25 });
  });

  it('projects items down to the requested fields (token-budget trimming)', async () => {
    const res = (await dispatcher.dispatch(owner, 'list_issues', { fields: ['id', 'title'] })) as {
      items: Array<Record<string, unknown>>;
    };
    expect(res.items[0]).toEqual({ id: 'wi-1', title: 'login bug' });
    expect(res.items[0]).not.toHaveProperty('description');
  });

  it('search returns the ranked page envelope (nextCursor null)', async () => {
    const res = (await dispatcher.dispatch(owner, 'search', { q: 'login' })) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });
});
