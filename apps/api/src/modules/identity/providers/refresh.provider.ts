import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthResult, RefreshRequest } from '@rytask/contracts';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { evaluateRefresh } from '../domain/token.policy';
import { AuthService } from '../services/auth.service';
import { SessionsRepository } from '../repositories/sessions.repository';
import { UsersRepository } from '../repositories/users.repository';
import { toUserSummary } from './user.mapper';
import type { RequestContext } from './login.provider';

/**
 * Rotate a refresh token (US2, FR-AUTH-002, SC-003). Valid token → issue a new access +
 * refresh within the same family and revoke the presented one. A token presented after it was
 * already rotated/revoked is treated as theft → the whole family is revoked. All failures → 401.
 */
@Injectable()
export class RefreshProvider {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly users: UsersRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    private readonly auth: AuthService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async refresh(input: RefreshRequest, ctx: RequestContext = {}): Promise<AuthResult> {
    const now = this.clock.now();
    const hash = this.tokenHasher.hash(input.refreshToken);
    const session = await this.sessions.findByRefreshHash(hash);
    const decision = evaluateRefresh(session, now);

    if (decision.action === 'revoke-family' && session) {
      await this.sessions.revokeFamily(session.familyId, now);
      throw new UnauthorizedException('refresh token reuse detected');
    }
    if (decision.action !== 'rotate' || !session) {
      throw new UnauthorizedException('invalid refresh token');
    }

    // Rotate: revoke the presented token, then reissue within the same family.
    await this.sessions.revoke(session.id, now);

    const user = await this.users.findById(session.userId);
    const role = await this.orgAccess.getRoleForUser(session.organizationId, session.userId);
    if (!user || !role || user.deactivatedAt !== null) {
      throw new UnauthorizedException('invalid refresh token');
    }
    const workspaceId =
      (await this.orgAccess.getDefaultWorkspaceId(session.organizationId)) ?? undefined;

    return this.auth.issueSession({
      user: toUserSummary(user),
      organizationId: session.organizationId,
      role,
      isOrgAdmin: this.orgAccess.isOrgAdminRole(role),
      workspaceId,
      familyId: session.familyId,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
  }
}
