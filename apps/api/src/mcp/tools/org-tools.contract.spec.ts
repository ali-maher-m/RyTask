import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 7 org-settings/membership MCP tools (T076, US4). Settings tools
 * return the org `settings`; membership tools act as the SESSION PRINCIPAL (the same explicit-actor
 * methods the REST controllers pass `req.principal` to), so an agent can't escalate beyond its role.
 */
const UID = '0193b3a0-0000-7000-8000-0000000000f1';
const settings = { timezone: 'UTC', weekStart: 'MONDAY' };
const membership = { userId: UID, role: 'ADMIN' };

const orgs = { current: vi.fn(async () => ({ id: 'o1', name: 'Org', slug: 'org', settings })) };
const members = {
  updateSettings: vi.fn(async () => ({ id: 'o1', name: 'Org', slug: 'org', settings })),
  listMembers: vi.fn(async () => [membership]),
  setMemberRole: vi.fn(async () => membership),
  removeMember: vi.fn(async () => undefined),
  transferOwnership: vi.fn(async () => undefined),
};
const invites = { create: vi.fn(async () => ({ id: 'inv-1', acceptUrl: 'https://x/accept' })) };

const dispatcher = buildDispatcher({ orgs, members, invites });
const owner = makeSession();

describe('MCP org + membership tools (contract)', () => {
  it('get/update org settings return just the settings', async () => {
    expect(await dispatcher.dispatch(owner, 'get_org_settings', {})).toEqual(settings);
    expect(await dispatcher.dispatch(owner, 'update_org_settings', { timezone: 'UTC' })).toEqual(
      settings,
    );
  });

  it('list_members returns the membership list', async () => {
    expect(await dispatcher.dispatch(owner, 'list_members', {})).toEqual([membership]);
  });

  it('membership mutations act as the session principal', async () => {
    await dispatcher.dispatch(owner, 'set_member_role', { userId: UID, role: 'ADMIN' });
    expect(members.setMemberRole).toHaveBeenCalledWith(owner.principal, UID, 'ADMIN');

    expect(await dispatcher.dispatch(owner, 'remove_member', { userId: UID })).toBeNull();
    expect(members.removeMember).toHaveBeenCalledWith(owner.principal, UID);

    expect(await dispatcher.dispatch(owner, 'transfer_ownership', { toUserId: UID })).toBeNull();
    expect(members.transferOwnership).toHaveBeenCalledWith(owner.principal, { toUserId: UID });

    const invite = await dispatcher.dispatch(owner, 'invite_member', {
      email: 'a@b.com',
      role: 'MEMBER',
    });
    expect(invite).toEqual({ id: 'inv-1', acceptUrl: 'https://x/accept' });
    expect(invites.create).toHaveBeenCalledWith(
      owner.principal,
      expect.objectContaining({ email: 'a@b.com', role: 'MEMBER' }),
    );
  });

  it('categorizes invalid input and denial', async () => {
    expect(
      await dispatchError(dispatcher, owner, 'set_member_role', { userId: 'bad', role: 'ADMIN' }),
    ).toBe('INVALID_ARGUMENT');
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['org:read'] });
    expect(
      await dispatchError(dispatcher, readOnly, 'update_org_settings', { timezone: 'UTC' }),
    ).toBe('PERMISSION_DENIED');
  });
});
