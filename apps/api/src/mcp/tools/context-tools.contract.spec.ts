import { describe, expect, it, vi } from 'vitest';
import type { WhoamiProvider } from '../../modules/identity/providers/whoami.provider';
import type { WorkspacesService } from '../../modules/orgs/services/workspaces.service';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';
import { ContextTools } from './context-tools';

/**
 * Contract test for the 4 MCP context tools (T069, US4, FR-MCP-003). `whoami` reflects the SESSION's
 * active workspace; `set_active_workspace` re-points it ONLY to an accessible workspace (NOT_FOUND
 * otherwise), and subsequent `whoami` shows the new scope. Built on the real `ContextTools` + the
 * EXISTING whoami/workspaces services (one brain everywhere).
 */
const WS_DEFAULT = '0193b3a0-0000-7000-8000-000000000002';
const WS_OTHER = '0193b3a0-0000-7000-8000-000000000022';

const whoamiProvider = {
  build: vi.fn(async () => ({
    user: { id: 'u1', email: 'u@x', name: 'U', emailVerified: true },
    organizationId: 'o1',
    activeWorkspaceId: null,
    role: 'OWNER',
    scopes: [],
    workspaces: [{ id: WS_DEFAULT, name: 'Default', slug: 'default' }],
  })),
} as unknown as WhoamiProvider;

const workspaces = {
  list: vi.fn(async () => [
    { id: WS_DEFAULT, name: 'Default', slug: 'default' },
    { id: WS_OTHER, name: 'Other', slug: 'other' },
  ]),
  get: vi.fn(async (id: string) => ({ id, name: 'Default', slug: 'default' })),
} as unknown as WorkspacesService;

const context = new ContextTools(whoamiProvider, workspaces);
const dispatcher = buildDispatcher({ context });

describe('MCP context tools (contract)', () => {
  it('whoami reflects the session active workspace', async () => {
    const session = makeSession();
    const who = (await dispatcher.dispatch(session, 'whoami', {})) as {
      activeWorkspaceId: string | null;
    };
    expect(who.activeWorkspaceId).toBe(WS_DEFAULT);
  });

  it('list_workspaces / get_workspace enumerate access', async () => {
    const session = makeSession();
    expect(await dispatcher.dispatch(session, 'list_workspaces', {})).toHaveLength(2);
    expect(await dispatcher.dispatch(session, 'get_workspace', { id: WS_OTHER })).toEqual({
      id: WS_OTHER,
      name: 'Default',
      slug: 'default',
    });
  });

  it('set_active_workspace re-points the session and whoami follows', async () => {
    const session = makeSession();
    const who = (await dispatcher.dispatch(session, 'set_active_workspace', {
      workspaceId: WS_OTHER,
    })) as { activeWorkspaceId: string | null };
    expect(who.activeWorkspaceId).toBe(WS_OTHER);
    expect(session.activeWorkspaceId).toBe(WS_OTHER);
  });

  it('set_active_workspace to an inaccessible workspace is NOT_FOUND', async () => {
    const session = makeSession();
    const unknown = '0193b3a0-0000-7000-8000-000000000099';
    expect(
      await dispatchError(dispatcher, session, 'set_active_workspace', { workspaceId: unknown }),
    ).toBe('NOT_FOUND');
  });
});
