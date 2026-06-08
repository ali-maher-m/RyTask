import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 5 statuses MCP tools (T072, US4). They dispatch to `StatusesService`,
 * unwrap single-status `{ data }`, pass through the `StatusListResponse` for list/reorder, and
 * `delete_status` forwards `reassignTo` (CONFLICT when a populated status lacks it).
 */
const PID = '0193b3a0-0000-7000-8000-0000000000c1';
const SID = '0193b3a0-0000-7000-8000-0000000000c2';
const status = { id: SID, name: 'To Do', category: 'UNSTARTED', color: '#ccc', position: 1 };

const statuses = {
  list: vi.fn(async () => ({ data: [status] })),
  create: vi.fn(async () => ({ data: status })),
  update: vi.fn(async () => ({ data: status })),
  reorder: vi.fn(async () => ({ data: [status] })),
  delete: vi.fn(async () => undefined),
};

const dispatcher = buildDispatcher({ statuses });
const owner = makeSession();

describe('MCP statuses tools (contract)', () => {
  it('list/create/update/reorder return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'list_statuses', { projectId: PID })).toEqual({
      data: [status],
    });
    expect(
      await dispatcher.dispatch(owner, 'create_status', {
        projectId: PID,
        name: 'To Do',
        category: 'UNSTARTED',
      }),
    ).toEqual(status);
    expect(await dispatcher.dispatch(owner, 'update_status', { id: SID, name: 'Doing' })).toEqual(
      status,
    );
    expect(
      await dispatcher.dispatch(owner, 'reorder_statuses', { projectId: PID, orderedIds: [SID] }),
    ).toEqual({
      data: [status],
    });
  });

  it('delete_status forwards reassignTo and returns null', async () => {
    expect(
      await dispatcher.dispatch(owner, 'delete_status', { id: SID, reassignTo: SID }),
    ).toBeNull();
    expect(statuses.delete).toHaveBeenCalledWith(SID, SID);
    // No reassignTo → null passed through.
    await dispatcher.dispatch(owner, 'delete_status', { id: SID });
    expect(statuses.delete).toHaveBeenLastCalledWith(SID, null);
  });

  it('categorizes a CONFLICT and a denial', async () => {
    statuses.delete.mockRejectedValueOnce(new ConflictException('status still has items'));
    expect(await dispatchError(dispatcher, owner, 'delete_status', { id: SID })).toBe('CONFLICT');
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'create_status', {
        projectId: PID,
        name: 'x',
        category: 'UNSTARTED',
      }),
    ).toBe('PERMISSION_DENIED');
  });
});
