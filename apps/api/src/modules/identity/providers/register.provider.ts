import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResult, RegisterRequest } from '@rytask/contracts';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { UserRegisteredEvent } from '../events/auth.events';
import { AuthService } from '../services/auth.service';
import { UsersRepository } from '../repositories/users.repository';
import { toUserSummary } from './user.mapper';
import type { RequestContext } from './login.provider';

/**
 * Self-registration (US2, FR-AUTH-001). Allowed only when the org has `allowPublicSignup`
 * enabled (invite-only by default, D8) → otherwise 403. A duplicate email → 409. On success
 * the user joins the single-org instance at MEMBER and is signed in.
 */
@Injectable()
export class RegisterProvider {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  async register(input: RegisterRequest, ctx: RequestContext = {}): Promise<AuthResult> {
    const signup = await this.orgAccess.getSignupContext();
    if (!signup || !signup.allowPublicSignup) {
      throw new ForbiddenException('public signup is disabled');
    }
    if (await this.users.findByEmail(input.email)) {
      throw new ConflictException('email already registered');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.users.create({
      organizationId: signup.organizationId,
      email: input.email,
      name: input.name,
      passwordHash,
    });
    await this.orgAccess.addMember(signup.organizationId, user.id, 'MEMBER');

    this.events.emit(
      UserRegisteredEvent.eventName,
      new UserRegisteredEvent(user.id, signup.organizationId),
    );

    return this.auth.issueSession({
      user: toUserSummary(user),
      organizationId: signup.organizationId,
      role: 'MEMBER',
      isOrgAdmin: false,
      workspaceId: signup.defaultWorkspaceId ?? undefined,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
  }
}
