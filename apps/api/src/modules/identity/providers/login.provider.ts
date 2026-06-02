import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResult, LoginRequest } from '@rytask/contracts';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import { ORG_ACCESS, type OrgAccessService } from '../../orgs/orgs.contract';
import { UserLoggedInEvent } from '../events/auth.events';
import { UsersRepository } from '../repositories/users.repository';
import { AuthService } from '../services/auth.service';
import { BruteForceService } from '../services/brute-force.service';
import { toUserSummary } from './user.mapper';

export interface RequestContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Email + password sign-in (US2, FR-AUTH-001/002). Verifies the argon2 hash, resolves the
 * user's org role (ORG_ACCESS), and issues a session. All failures return a **generic 401**
 * (no account-existence signal — no enumeration). Deactivated users cannot sign in. Repeated
 * failures from the same `(email, IP)` are locked out via {@link BruteForceService} (SC-011).
 */
@Injectable()
export class LoginProvider {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    private readonly auth: AuthService,
    private readonly bruteForce: BruteForceService,
    private readonly events: EventEmitter2,
  ) {}

  async login(input: LoginRequest, ctx: RequestContext = {}): Promise<AuthResult> {
    const ip = ctx.ip ?? null;
    // Checked before the user lookup so the lockout is identical for known and unknown emails.
    await this.bruteForce.assertNotLocked(input.email, ip);

    const user = await this.users.findByEmail(input.email);
    const verified = user?.passwordHash
      ? await this.hasher.verify(user.passwordHash, input.password)
      : false;
    if (!user || !verified || user.deactivatedAt !== null) {
      await this.bruteForce.recordFailure(input.email, ip);
      throw new UnauthorizedException('invalid credentials');
    }

    const role = await this.orgAccess.getRoleForUser(user.organizationId, user.id);
    if (!role) {
      await this.bruteForce.recordFailure(input.email, ip);
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
      ip,
    });

    // Successful sign-in clears the failure counter for this (email, IP).
    await this.bruteForce.reset(input.email, ip);

    this.events.emit(
      UserLoggedInEvent.eventName,
      new UserLoggedInEvent(user.id, user.organizationId),
    );
    return result;
  }
}
