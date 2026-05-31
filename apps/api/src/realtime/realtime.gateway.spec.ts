import { describe, expect, it, vi } from 'vitest';
import { type RealtimeClient, RealtimeGateway } from './realtime.gateway';

/**
 * The realtime gateway is a SEAM (no fan-out, C2). The one behaviour M1 must
 * guarantee is that an unauthenticated connection is rejected and that channel names
 * are always org-scoped (so a later publisher cannot leak across tenants).
 */
describe('RealtimeGateway (seam)', () => {
  const gateway = new RealtimeGateway();

  const makeClient = (overrides: Partial<RealtimeClient> = {}): RealtimeClient => ({
    disconnect: vi.fn(),
    ...overrides,
  });

  it('rejects a connection with no bearer credential', () => {
    const client = makeClient();
    gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a connection with a non-bearer authorization header', () => {
    const client = makeClient({ handshake: { headers: { authorization: 'Basic abc' } } });
    gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('accepts a connection carrying a handshake auth token', () => {
    const client = makeClient({ handshake: { auth: { token: 'pat_123' } } });
    gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('accepts a connection carrying a Bearer header', () => {
    const client = makeClient({ handshake: { headers: { authorization: 'Bearer jwt.abc' } } });
    gateway.handleConnection(client);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('derives org-scoped channel names', () => {
    expect(gateway.channelFor('org-1', 'inbox')).toBe('org:org-1:inbox');
    expect(gateway.channelFor('org-1', 'work_item', 'wi-9')).toBe('org:org-1:work_item:wi-9');
  });
});
