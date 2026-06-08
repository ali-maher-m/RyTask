import { Injectable } from '@nestjs/common';
import type { Principal } from '../common/auth/principal';
import { TokenVerifier } from '../modules/identity/services/token-verifier.service';
import { McpToolError } from './mcp-errors';

/**
 * Resolves an MCP client's Personal Access Token into a {@link Principal} (M3, FR-MCP-002,
 * research D9). Reuses the **existing M0** `TokenVerifier` — one auth implementation, not two —
 * which looks the token up by hash, checks revocation/expiry, resolves the holder's current org
 * role, and stamps `lastUsedAt`. The MCP edge is a transport sibling of the REST controllers
 * (not a domain module), so it may inject the identity service directly. A revoked/invalid token
 * (incl. mid-session) yields `PERMISSION_DENIED`.
 */
@Injectable()
export class McpAuth {
  constructor(private readonly verifier: TokenVerifier) {}

  /**
   * Resolve a bearer credential to a principal. Accepts either a full `Authorization` header
   * value (`Bearer rytask_mcp_…` — HTTP transport) or a bare token (`RYTASK_PAT` env — stdio).
   */
  async resolvePrincipal(credential: string | undefined): Promise<Principal> {
    const header = this.toAuthHeader(credential);
    const principal = await this.verifier.verify(header);
    if (!principal) {
      throw new McpToolError('PERMISSION_DENIED', 'Invalid or revoked access token.');
    }
    return principal;
  }

  private toAuthHeader(credential: string | undefined): string | undefined {
    if (!credential) {
      return undefined;
    }
    return credential.toLowerCase().startsWith('bearer ') ? credential : `Bearer ${credential}`;
  }
}
