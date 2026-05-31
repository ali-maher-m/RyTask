import { Injectable, Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';

/**
 * Minimal transport-agnostic client shape. We avoid a hard dependency on a concrete
 * WS engine (socket.io) at the seam stage — the gateway only needs to read the
 * handshake auth and be able to disconnect/join. The realtime milestone swaps in the
 * real adapter without changing this contract (deviation C2, research D16).
 */
export interface RealtimeClient {
  handshake?: {
    auth?: { token?: string };
    headers?: Record<string, string | string[] | undefined>;
  };
  data?: Record<string, unknown>;
  join?: (room: string) => void;
  disconnect: (close?: boolean) => void;
}

/**
 * Realtime gateway **seam** (research D16, deviation C2). M1 stands up an
 * authenticated, tenant-scoped channel surface with **no publishers / no live
 * fan-out** — views and the inbox refresh on navigation (spec Assumptions). The
 * realtime milestone only adds publishers + a Redis pub/sub adapter, not a new
 * surface. Auth verification proper lands with M0; here we reject connections with
 * no bearer credential and derive channel names that are always org-scoped.
 */
@Injectable()
@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  /** Pull a bearer credential from the WS handshake (auth payload or header). */
  extractToken(client: RealtimeClient): string | null {
    const fromAuth = client.handshake?.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth;
    }
    const header = client.handshake?.headers?.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value === 'string' && value.toLowerCase().startsWith('bearer ')) {
      const token = value.slice('bearer '.length).trim();
      return token.length > 0 ? token : null;
    }
    return null;
  }

  /**
   * Tenant- and resource-scoped channel name. Every channel leads with the org id so
   * a subscription can never span tenants (mirrors the repository tenant scope).
   */
  channelFor(organizationId: string, resource: string, resourceId?: string): string {
    const base = `org:${organizationId}:${resource}`;
    return resourceId ? `${base}:${resourceId}` : base;
  }

  /** Reject any connection without a bearer credential (FR-AUTH / Principle VI). */
  handleConnection(client: RealtimeClient): void {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.debug('Rejecting unauthenticated realtime connection');
      client.disconnect(true);
      return;
    }
    // TODO(M0): verify the token, resolve the principal + org, then
    // client.join(this.channelFor(orgId, 'inbox', userId)) etc. No fan-out in M1.
  }
}
