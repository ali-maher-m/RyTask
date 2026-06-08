import { Inject, Injectable } from '@nestjs/common';
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { ApiTokensRepository } from '../repositories/api-tokens.repository';
import { TokenSigner } from './token-signer.service';

/** PAT secret prefixes (api_tokens). Tokens with these prefixes verify via the DB lookup path. */
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
 * Verifies a bearer credential into a {@link Principal} (research D4/D5). An **access JWT** is
 * verified with no DB round-trip (the principal is rebuilt from claims). A **PAT/MCP** secret
 * is looked up by hash, checked for revocation/expiry, resolved to the holder's *current* org
 * role (so a deactivated/removed holder is rejected), stamped `lastUsedAt`, and carries the
 * token's `scopes` so the RbacGuard can apply scope ∩ role. Returns `null` on any failure;
 * the caller (AuthGuard) maps that to 401.
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly signer: TokenSigner,
    private readonly apiTokens: ApiTokensRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async verify(authHeader: string | undefined): Promise<Principal | null> {
    const token = extractBearer(authHeader);
    if (!token) {
      return null;
    }
    if (PAT_PREFIXES.some((p) => token.startsWith(p))) {
      return this.verifyPat(token);
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

  /** Resolve a PAT/MCP secret to a principal (hash lookup → revoke/expiry → role → last-used). */
  private async verifyPat(secret: string): Promise<Principal | null> {
    const now = this.clock.now();
    const row = await this.apiTokens.findByHash(this.tokenHasher.hash(secret));
    if (
      !row ||
      row.revokedAt !== null ||
      (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime())
    ) {
      return null;
    }
    // The agent acts as the holder, bounded by their CURRENT role (removal/deactivation → reject).
    const role = await this.orgAccess.getRoleForUser(row.organizationId, row.userId);
    if (!role) {
      return null;
    }
    await this.apiTokens.stampLastUsed(row.id, now);
    const workspaceId =
      (await this.orgAccess.getDefaultWorkspaceId(row.organizationId)) ?? undefined;
    return {
      userId: row.userId,
      organizationId: row.organizationId,
      workspaceId,
      role,
      isOrgAdmin: this.orgAccess.isOrgAdminRole(role),
      scopes: row.scopes ?? [],
      // Non-UI credential — lets REST capture record source = 'API' (M3, capture-source.md §2).
      isApiToken: true,
    };
  }
}
