import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the `search` MCP tool (T075, US4). It dispatches to `SearchService` and
 * shapes the flat ranked result into the `{ items, nextCursor }` page envelope (nextCursor always null
 * — search is a short ranked list, not cursored). The result set is tenant + permission scoped server-side.
 */
const hit = {
  type: 'work_item',
  id: 'wi-1',
  title: 'login bug',
  snippet: null,
  rank: 0.9,
  projectId: 'p1',
};
const search = { search: vi.fn(async () => ({ data: [hit] })) };

const dispatcher = buildDispatcher({ search });
const owner = makeSession();

describe('MCP search tool (contract)', () => {
  it('returns a ranked page envelope', async () => {
    const res = await dispatcher.dispatch(owner, 'search', { q: 'login' });
    expect(res).toEqual({ items: [hit], nextCursor: null });
    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'login' }));
  });

  it('categorizes invalid input and denial', async () => {
    expect(await dispatchError(dispatcher, owner, 'search', { q: '' })).toBe('INVALID_ARGUMENT');
    const noRead = makeSession({ role: 'GUEST', scopes: ['tokens:read'] });
    expect(await dispatchError(dispatcher, noRead, 'search', { q: 'x' })).toBe('PERMISSION_DENIED');
  });
});
