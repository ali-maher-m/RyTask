import { Injectable } from '@nestjs/common';
import type { Principal } from '../../../common/auth/principal';
import { TokenSigner } from './token-signer.service';

/** PAT secret prefixes (api_tokens). PAT verification lands in US7. */
const PAT_PREFIXES = ['rytask_pat_', 'rytask_mcp_'];

/** Extract the bearer credential from an `Authorization` header. */
export function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  const [scheme, value] = authHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

/**
 * Verifies a bearer credential into a {@link Principal} (research D4). M0/US2 verifies the
 * **access JWT** with no DB round-trip (the principal is rebuilt from claims). PAT
 * verification (api_tokens lookup → role resolution → scope ∩ role, `lastUsedAt`) is layered
 * in US7. Returns `null` on any failure; the caller (AuthGuard) maps that to 401.
 */
@Injectable()
export class TokenVerifier {
  constructor(private readonly signer: TokenSigner) {}

  async verify(authHeader: string | undefined): Promise<Principal | null> {
    const token = extractBearer(authHeader);
    if (!token) {
      return null;
    }
    if (PAT_PREFIXES.some((p) => token.startsWith(p))) {
      // PAT/MCP verification is implemented in US7 (api-tokens repository + scope ∩ role).
      return null;
    }
    try {
      const claims = this.signer.verify(token);
      return {
        userId: claims.sub,
        organizationId: claims.org,
        workspaceId: claims.wsp,
        role: claims.role,
        isOrgAdmin: claims.adm,
        scopes: claims.scopes ?? [],
      };
    } catch {
      return null;
    }
  }
}
