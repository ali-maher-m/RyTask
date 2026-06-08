import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 14 work-items/labels MCP tools (T070, US4, mcp-server.md §8). Each
 * tool dispatches to the SAME `WorkItemsService`/`LabelsService` REST uses, returns the unwrapped DTO
 * its contract declares, and surfaces categorized errors (INVALID_ARGUMENT / PERMISSION_DENIED /
 * NOT_FOUND). Together with T071–T077 these cover all 49 tools — `check-mcp-parity` stays green.
 */
const ID = '0193b3a0-0000-7000-8000-0000000000a1';
const LID = '0193b3a0-0000-7000-8000-0000000000a2';
const workItem = { id: ID, key: 'RY-1', title: 'A task', source: 'MCP' };

const workItems = {
  create: vi.fn(async () => ({ data: workItem, meta: { unresolved: [] } })),
  update: vi.fn(async () => ({ data: workItem })),
  delete: vi.fn(async () => undefined),
  restore: vi.fn(async () => ({ data: workItem })),
  move: vi.fn(async () => ({ data: workItem })),
  addSubtask: vi.fn(async () => ({ data: workItem, meta: { unresolved: [] } })),
  list: vi.fn(async () => ({
    data: [workItem],
    pageInfo: { nextCursor: 'c2', hasNextPage: true },
  })),
  get: vi.fn(async () => ({ data: workItem })),
  addLabel: vi.fn(async () => ({ labelId: LID })),
  removeLabel: vi.fn(async () => undefined),
  listActivity: vi.fn(async () => ({ data: [{ id: 'act-1', action: 'CREATED' }] })),
};
const labels = {
  list: vi.fn(async () => ({ data: [{ id: LID, name: 'bug', color: '#fff' }] })),
  create: vi.fn(async () => ({ data: { id: LID, name: 'bug', color: '#fff' } })),
};

const dispatcher = buildDispatcher({ workItems, labels });
const owner = makeSession();

describe('MCP work-items tools (contract)', () => {
  it('create_issue / quick_add_issue stamp source=MCP and return the create envelope', async () => {
    const res = await dispatcher.dispatch(owner, 'create_issue', {
      projectId: ID,
      title: 'A task',
    });
    expect(res).toEqual({ data: workItem, meta: { unresolved: [] } });
    expect(workItems.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'MCP' }));

    await dispatcher.dispatch(owner, 'quick_add_issue', { projectId: ID, text: 'do it !urgent' });
    expect(workItems.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'MCP', quickAdd: 'do it !urgent' }),
    );
  });

  it('returns unwrapped DTOs for update/restore/move/get and null for delete/remove', async () => {
    expect(
      await dispatcher.dispatch(owner, 'update_issue', { id: ID, version: 1, title: 'x' }),
    ).toEqual(workItem);
    expect(await dispatcher.dispatch(owner, 'restore_issue', { id: ID })).toEqual(workItem);
    expect(
      await dispatcher.dispatch(owner, 'move_issue', { id: ID, version: 1, statusId: LID }),
    ).toEqual(workItem);
    expect(await dispatcher.dispatch(owner, 'get_issue', { id: ID })).toEqual(workItem);
    expect(await dispatcher.dispatch(owner, 'delete_issue', { id: ID })).toBeNull();
    expect(
      await dispatcher.dispatch(owner, 'remove_label_from_issue', { id: ID, labelId: LID }),
    ).toBeNull();
  });

  it('add_subtask / add_label / activity / labels return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'add_subtask', { parentId: ID, title: 'sub' })).toEqual(
      {
        data: workItem,
        meta: { unresolved: [] },
      },
    );
    expect(await dispatcher.dispatch(owner, 'add_label_to_issue', { id: ID, name: 'bug' })).toEqual(
      {
        labelId: LID,
      },
    );
    expect(await dispatcher.dispatch(owner, 'list_issue_activity', { id: ID })).toEqual([
      { id: 'act-1', action: 'CREATED' },
    ]);
    expect(await dispatcher.dispatch(owner, 'list_labels', {})).toEqual({
      data: [{ id: LID, name: 'bug', color: '#fff' }],
    });
    expect(await dispatcher.dispatch(owner, 'create_label', { name: 'bug' })).toEqual({
      id: LID,
      name: 'bug',
      color: '#fff',
    });
  });

  it('list_issues returns the cursored page envelope', async () => {
    const res = await dispatcher.dispatch(owner, 'list_issues', { limit: 10 });
    expect(res).toEqual({ items: [workItem], nextCursor: 'c2' });
  });

  it('categorizes bad input, denial, and not-found', async () => {
    // INVALID_ARGUMENT — a non-uuid id fails zod before any service call.
    expect(await dispatchError(dispatcher, owner, 'get_issue', { id: 'nope' })).toBe(
      'INVALID_ARGUMENT',
    );

    // PERMISSION_DENIED — a read-only PAT cannot mutate even as a capable user (scope ∩ role).
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'create_issue', { projectId: ID, title: 'x' }),
    ).toBe('PERMISSION_DENIED');

    // NOT_FOUND — a missing entity in the principal's scope.
    workItems.get.mockRejectedValueOnce(new NotFoundException('work item not found'));
    expect(await dispatchError(dispatcher, owner, 'get_issue', { id: ID })).toBe('NOT_FOUND');
  });
});
