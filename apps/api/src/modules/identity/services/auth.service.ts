import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult } from '@rytask/contracts';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../../common/ports/id-generator.port';
import { type IssueSessionParams, type SessionIssuer } from '../identity.contract';
import { SessionsRepository } from '../repositories/sessions.repository';
import { TokenSigner } from './token-signer.service';

/**
 * Identity application service (auth.service). M0-foundational: the shared
 * **session-issuance primitive** (research D3) that both the first-run bootstrap (US1)
 * and login (US2) call — mint a signed access token + an opaque, hash-at-rest refresh
 * token persisted in a rotation `family`. US2 extends this class with
 * register/login/refresh/logout. Implements {@link SessionIssuer} for cross-module use.
 */
@Injectable()
export class AuthService implements SessionIssuer {
  constructor(
    private readonly tokenSigner: TokenSigner,
    private readonly sessions: SessionsRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
  ) {}

  /**
   * Issue a session: persist a new (or rotated) refresh credential and return the access
   * token + the opaque refresh token (shown once). The refresh secret is stored only as a
   * keyed hash (SC-002); the access token carries the principal so verification needs no DB.
   */
  async issueSession(params: IssueSessionParams): Promise<AuthResult> {
    const now = this.clock.now();
    const familyId = params.familyId ?? this.ids.next();
    const refreshToken = this.tokenHasher.generate('rytask_rt_');
    const refreshTokenHash = this.tokenHasher.hash(refreshToken);
    const expiresAt = new Date(now.getTime() + this.config.jwt.refreshTtlSeconds * 1000);

    await this.sessions.create({
      organizationId: params.organizationId,
      userId: params.user.id,
      familyId,
      refreshTokenHash,
      expiresAt,
      userAgent: params.userAgent ?? null,
      ip: params.ip ?? null,
    });

    const accessToken = this.tokenSigner.sign({
      sub: params.user.id,
      org: params.organizationId,
      wsp: params.workspaceId,
      role: params.role,
      adm: params.isOrgAdmin,
      scopes: params.scopes ?? [],
      ver: 0,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenSigner.accessTtlSeconds,
      user: params.user,
    };
  }
}
