import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 4 saved-views MCP tools (T073, US4). They dispatch to `ViewsService`,
 * pass through the `ViewListResponse` for list, and unwrap single-view `{ data }` for save/update.
 */
const VID = '0193b3a0-0000-7000-8000-0000000000d1';
const view = { id: VID, name: 'My board', kind: 'BOARD', scope: 'PERSONAL' };

const views = {
  list: vi.fn(async () => ({ data: [view] })),
  save: vi.fn(async () => ({ data: view })),
  update: vi.fn(async () => ({ data: view })),
  delete: vi.fn(async () => undefined),
};

const dispatcher = buildDispatcher({ views });
const owner = makeSession();

describe('MCP views tools (contract)', () => {
  it('list/save/update/delete return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'list_views', {})).toEqual({ data: [view] });
    expect(
      await dispatcher.dispatch(owner, 'save_view', { name: 'My board', kind: 'BOARD' }),
    ).toEqual(view);
    expect(await dispatcher.dispatch(owner, 'update_view', { id: VID, name: 'Renamed' })).toEqual(
      view,
    );
    expect(await dispatcher.dispatch(owner, 'delete_view', { id: VID })).toBeNull();
  });

  it('passes an optional projectId filter to list', async () => {
    const PID = '0193b3a0-0000-7000-8000-0000000000d2';
    await dispatcher.dispatch(owner, 'list_views', { projectId: PID });
    expect(views.list).toHaveBeenLastCalledWith(PID);
  });

  it('categorizes invalid input and denial', async () => {
    expect(await dispatchError(dispatcher, owner, 'save_view', { name: 'x', kind: 'WRONG' })).toBe(
      'INVALID_ARGUMENT',
    );
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'save_view', { name: 'x', kind: 'LIST' }),
    ).toBe('PERMISSION_DENIED');
  });
});
