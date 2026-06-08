import { describe, expect, it, vi } from 'vitest';
import { buildDispatcher, dispatchError, makeSession } from '../mcp.testkit';

/**
 * Per-tool contract test for the 3 PAT MCP tools (T077, US4). They dispatch to `ApiTokensProvider`
 * acting as the SESSION PRINCIPAL (own tokens only), so an agent governs the same tokens the REST
 * api-tokens routes do. The mint secret is returned once by `create_api_token`.
 */
const TID = '0193b3a0-0000-7000-8000-000000000111';
const tokenDto = { id: TID, name: 'agent', type: 'MCP', scopes: ['work:read'] };
const secret = { ...tokenDto, secret: 'rytask_mcp_shown_once' };

const tokens = {
  list: vi.fn(async () => [tokenDto]),
  issue: vi.fn(async () => secret),
  revoke: vi.fn(async () => undefined),
};

const dispatcher = buildDispatcher({ tokens });
const owner = makeSession();

describe('MCP token tools (contract)', () => {
  it('list/create/revoke act as the session principal', async () => {
    expect(await dispatcher.dispatch(owner, 'list_api_tokens', {})).toEqual([tokenDto]);
    expect(tokens.list).toHaveBeenCalledWith(owner.principal);

    const minted = await dispatcher.dispatch(owner, 'create_api_token', { name: 'agent' });
    expect(minted).toEqual(secret);
    expect(tokens.issue).toHaveBeenCalledWith(
      owner.principal,
      expect.objectContaining({ name: 'agent' }),
    );

    expect(await dispatcher.dispatch(owner, 'revoke_api_token', { id: TID })).toBeNull();
    expect(tokens.revoke).toHaveBeenCalledWith(owner.principal, TID);
  });

  it('categorizes invalid input and denial', async () => {
    expect(await dispatchError(dispatcher, owner, 'revoke_api_token', { id: 'bad' })).toBe(
      'INVALID_ARGUMENT',
    );
    const readOnly = makeSession({ role: 'MEMBER', scopes: ['tokens:read'] });
    expect(await dispatchError(dispatcher, readOnly, 'create_api_token', { name: 'x' })).toBe(
      'PERMISSION_DENIED',
    );
  });
});
