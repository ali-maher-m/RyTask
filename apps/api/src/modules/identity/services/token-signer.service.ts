import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@rytask/contracts';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';

/**
 * Stateless access-token claims (research D3). Carries identity + tenant + role so the
 * principal is rebuilt with NO DB round-trip on the happy path (perf goal). `role`/`adm`
 * are valid for the ≤15-min token lifetime; deactivation/removal revokes the refresh
 * session so a stale access token expires within the window.
 */
export interface AccessTokenClaims {
  /** userId */
  sub: string;
  /** organizationId */
  org: string;
  /** workspaceId */
  wsp?: string;
  role: Role;
  /** isOrgAdmin */
  adm: boolean;
  /** PAT scopes (absent/empty for UI sessions). */
  scopes?: string[];
  /** token version (reserved for global invalidation). */
  ver: number;
}

/**
 * Signs / verifies the access JWT (research D3). HS256 by default (one shared secret for
 * the api+worker image, ADR-012); RS256 when PEM keys are configured (future external
 * verifiers / MCP). No DB access — pure crypto behind typed config.
 */
@Injectable()
export class TokenSigner {
  private readonly jwt: JwtService;
  private readonly ttl: number;
  private readonly issuer: string;

  constructor(@Inject(authConfig.KEY) config: AuthConfigType) {
    this.ttl = config.jwt.accessTtlSeconds;
    this.issuer = config.jwt.issuer;
    this.jwt = new JwtService(
      config.jwt.algorithm === 'RS256'
        ? {
            privateKey: config.jwt.privateKey,
            publicKey: config.jwt.publicKey,
            signOptions: { algorithm: 'RS256' },
          }
        : { secret: config.jwt.secret, signOptions: { algorithm: 'HS256' } },
    );
  }

  /** Sign a short-lived access token. */
  sign(claims: AccessTokenClaims): string {
    return this.jwt.sign(claims, { expiresIn: this.ttl, issuer: this.issuer });
  }

  /** Verify + decode an access token; throws if invalid/expired (caller maps to 401). */
  verify(token: string): AccessTokenClaims {
    return this.jwt.verify<AccessTokenClaims>(token, { issuer: this.issuer });
  }

  /** Access-token lifetime in seconds (≤ 900) — surfaced as `expiresIn`. */
  get accessTtlSeconds(): number {
    return this.ttl;
  }
}
