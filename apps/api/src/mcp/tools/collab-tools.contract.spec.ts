import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 4 comments/notifications MCP tools (T074, US4). They dispatch to
 * `CommentsService`/`NotificationsService`, pass through list envelopes, and unwrap single `{ data }`.
 */
const WID = '0193b3a0-0000-7000-8000-0000000000e1';
const NID = '0193b3a0-0000-7000-8000-0000000000e2';
const comment = { id: 'cm-1', workItemId: WID, body: 'hi' };
const notification = { id: NID, type: 'MENTIONED', readAt: null };

const comments = {
  list: vi.fn(async () => ({
    data: [comment],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  create: vi.fn(async () => ({ data: comment })),
};
const notifications = {
  list: vi.fn(async () => ({
    data: [notification],
    pageInfo: { nextCursor: null, hasNextPage: false },
  })),
  update: vi.fn(async () => ({ data: notification })),
};

const dispatcher = buildDispatcher({ comments, notifications });
const owner = makeSession();

describe('MCP collaboration tools (contract)', () => {
  it('list_comments / add_comment return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'list_comments', { workItemId: WID })).toEqual({
      data: [comment],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    expect(
      await dispatcher.dispatch(owner, 'add_comment', { workItemId: WID, body: 'hi' }),
    ).toEqual(comment);
    expect(comments.create).toHaveBeenCalledWith(WID, { body: 'hi' });
  });

  it('list_notifications / update_notification return their declared shapes', async () => {
    expect(await dispatcher.dispatch(owner, 'list_notifications', {})).toEqual({
      data: [notification],
      pageInfo: { nextCursor: null, hasNextPage: false },
    });
    expect(
      await dispatcher.dispatch(owner, 'update_notification', { id: NID, read: true }),
    ).toEqual(notification);
    expect(notifications.update).toHaveBeenCalledWith(NID, { read: true });
  });

  it('categorizes invalid input and denial', async () => {
    expect(
      await dispatchError(dispatcher, owner, 'add_comment', { workItemId: WID, body: '' }),
    ).toBe('INVALID_ARGUMENT');
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'add_comment', { workItemId: WID, body: 'x' }),
    ).toBe('PERMISSION_DENIED');
  });
});
