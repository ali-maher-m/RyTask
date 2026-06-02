import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResult, LoginRequest } from '@rytask/contracts';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { UserLoggedInEvent } from '../events/auth.events';
import { AuthService } from '../services/auth.service';
import { UsersRepository } from '../repositories/users.repository';
import { toUserSummary } from './user.mapper';

export interface RequestContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Email + password sign-in (US2, FR-AUTH-001/002). Verifies the argon2 hash, resolves the
 * user's org role (ORG_ACCESS), and issues a session. All failures return a **generic 401**
 * (no account-existence signal — no enumeration). Deactivated users cannot sign in.
 */
@Injectable()
export class LoginProvider {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  async login(input: LoginRequest, ctx: RequestContext = {}): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const verified = user?.passwordHash
      ? await this.hasher.verify(user.passwordHash, input.password)
      : false;
    if (!user || !verified || user.deactivatedAt !== null) {
      throw new UnauthorizedException('invalid credentials');
    }

    const role = await this.orgAccess.getRoleForUser(user.organizationId, user.id);
    if (!role) {
      throw new UnauthorizedException('invalid credentials');
    }
    const workspaceId =
      (await this.orgAccess.getDefaultWorkspaceId(user.organizationId)) ?? undefined;

    const result = await this.auth.issueSession({
      user: toUserSummary(user),
      organizationId: user.organizationId,
      role,
      isOrgAdmin: this.orgAccess.isOrgAdminRole(role),
      workspaceId,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });

    this.events.emit(
      UserLoggedInEvent.eventName,
      new UserLoggedInEvent(user.id, user.organizationId),
    );
    return result;
  }
}
