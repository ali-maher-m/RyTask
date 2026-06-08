import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 7 projects MCP tools (T071, US4). They dispatch to the SAME
 * `ProjectsService` REST uses, unwrap its `{ data }` envelopes, and `archive_project` maps to
 * `update({ archived })`. `add_project_member` returns the added member (the service is void).
 */
const PID = '0193b3a0-0000-7000-8000-0000000000b1';
const UID = '0193b3a0-0000-7000-8000-0000000000b2';
const project = { id: PID, name: 'Proj', keyPrefix: 'PRJ' };

const projects = {
  list: vi.fn(async () => ({
    data: [project],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  get: vi.fn(async () => ({ data: project })),
  create: vi.fn(async () => ({ data: project })),
  update: vi.fn(async () => ({ data: project })),
  delete: vi.fn(async () => undefined),
  addMember: vi.fn(async () => undefined),
};

const dispatcher = buildDispatcher({ projects });
const owner = makeSession();

describe('MCP projects tools (contract)', () => {
  it('list/get/create/update return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'list_projects', { limit: 25 })).toEqual({
      data: [project],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    expect(await dispatcher.dispatch(owner, 'get_project', { id: PID })).toEqual(project);
    expect(
      await dispatcher.dispatch(owner, 'create_project', { name: 'Proj', keyPrefix: 'PRJ' }),
    ).toEqual(project);
    expect(
      await dispatcher.dispatch(owner, 'update_project', { id: PID, name: 'Renamed' }),
    ).toEqual(project);
  });

  it('archive_project maps to update({ archived }) and delete returns null', async () => {
    expect(
      await dispatcher.dispatch(owner, 'archive_project', { id: PID, archived: true }),
    ).toEqual(project);
    expect(projects.update).toHaveBeenLastCalledWith(PID, { archived: true });
    expect(await dispatcher.dispatch(owner, 'delete_project', { id: PID })).toBeNull();
  });

  it('add_project_member returns the added member', async () => {
    const res = await dispatcher.dispatch(owner, 'add_project_member', {
      projectId: PID,
      userId: UID,
      role: 'MEMBER',
    });
    expect(res).toEqual({ userId: UID, role: 'MEMBER' });
    expect(projects.addMember).toHaveBeenCalledWith(PID, { userId: UID, role: 'MEMBER' });
  });

  it('categorizes invalid input and denial', async () => {
    expect(await dispatchError(dispatcher, owner, 'get_project', { id: 'bad' })).toBe(
      'INVALID_ARGUMENT',
    );
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'create_project', { name: 'P', keyPrefix: 'PRJ' }),
    ).toBe('PERMISSION_DENIED');
  });
});
