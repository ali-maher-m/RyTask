import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from './mcp.testkit';

/**
 * MCP categorized-error contract (T106, US8, FR-MCP-004, research D12). Every tool surfaces a small,
 * stable error vocabulary the agent can act on: invalid input → INVALID_ARGUMENT, a denied capability
 * → PERMISSION_DENIED, a missing entity → NOT_FOUND, a version/uniqueness clash → CONFLICT. Crucially,
 * a rejected call performs NO partial mutation — validation and the scope ∩ role gate both run BEFORE
 * the underlying service is ever touched.
 */
const ID = '0193b3a0-0000-7000-8000-0000000000b1';
const workItem = { id: ID, key: 'RY-1', title: 'A task', source: 'MCP' };

describe('MCP categorized errors (contract)', () => {
  it('invalid input → INVALID_ARGUMENT, and the service is never called (no partial mutation)', async () => {
    const create = vi.fn(async () => ({ data: workItem, meta: { unresolved: [] } }));
    const update = vi.fn(async () => ({ data: workItem }));
    const dispatcher = buildDispatcher({ workItems: { create, update } });
    const owner = makeSession();

    // A non-uuid projectId fails zod before the create service is ever called.
    expect(
      await dispatchError(dispatcher, owner, 'create_issue', { projectId: 'nope', title: 'x' }),
    ).toBe('INVALID_ARGUMENT');
    // Likewise a non-uuid id is rejected up front, before the update service.
    expect(
      await dispatchError(dispatcher, owner, 'update_issue', {
        id: 'nope',
        version: 1,
        title: 'x',
      }),
    ).toBe('INVALID_ARGUMENT');

    expect(create).not.toHaveBeenCalled(); // no write was attempted
    expect(update).not.toHaveBeenCalled();
  });

  it('a read-only PAT mutating → PERMISSION_DENIED, service untouched (default-deny)', async () => {
    const create = vi.fn(async () => ({ data: workItem, meta: { unresolved: [] } }));
    const dispatcher = buildDispatcher({ workItems: { create } });
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['work:read'] });

    expect(
      await dispatchError(dispatcher, readOnly, 'create_issue', { projectId: ID, title: 'x' }),
    ).toBe('PERMISSION_DENIED');
    expect(create).not.toHaveBeenCalled();
  });

  it('a missing entity → NOT_FOUND', async () => {
    const get = vi.fn(async () => {
      throw new NotFoundException('work item not found');
    });
    const dispatcher = buildDispatcher({ workItems: { get } });
    const owner = makeSession();

    expect(await dispatchError(dispatcher, owner, 'get_issue', { id: ID })).toBe('NOT_FOUND');
  });

  it('a forbidden domain action → PERMISSION_DENIED', async () => {
    const update = vi.fn(async () => {
      throw new ForbiddenException('not a project member');
    });
    const dispatcher = buildDispatcher({ workItems: { update } });
    const owner = makeSession();

    expect(
      await dispatchError(dispatcher, owner, 'update_issue', { id: ID, version: 1, title: 'x' }),
    ).toBe('PERMISSION_DENIED');
  });

  it('a version/uniqueness clash → CONFLICT', async () => {
    const update = vi.fn(async () => {
      throw new ConflictException('stale version');
    });
    const dispatcher = buildDispatcher({ workItems: { update } });
    const owner = makeSession();

    expect(
      await dispatchError(dispatcher, owner, 'update_issue', { id: ID, version: 1, title: 'x' }),
    ).toBe('CONFLICT');
  });
});
