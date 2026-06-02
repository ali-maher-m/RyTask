import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AcceptInvite, AcceptInviteResult, Role, UserSummary } from '@rytask/contracts';
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import {
  SESSION_ISSUER,
  type SessionIssuer,
  USER_PROVISIONING,
  type UserProvisioningService,
} from '../../identity/identity.contract';
import { isRedeemable } from '../domain/invitation.policy';
import { MemberJoinedEvent } from '../events/member.events';
import { ORG_ACCESS, type OrgAccessService } from '../orgs.contract';
import { InvitationsRepository } from '../repositories/invitations.repository';

/**
 * Invite acceptance (US3, FR-AUTH-011, research D8). Redeems a PENDING invite → a membership
 * at the pre-assigned role, then signs the invitee in (SESSION_ISSUER). The route is public
 * (token-bearing); a signed-in caller's principal is honored when present. Idempotent: an
 * already-active member gains no duplicate membership (AC4); an expired/used/revoked invite is
 * refused with no side-effect (AC3, 410). `orgs` owns memberships but defers account
 * lookup/creation to identity via the `USER_PROVISIONING` port (Principle III).
 */
@Injectable()
export class AcceptInviteProvider {
  constructor(
    private readonly invites: InvitationsRepository,
    @Inject(ORG_ACCESS) private readonly orgAccess: OrgAccessService,
    @Inject(USER_PROVISIONING) private readonly userProvisioning: UserProvisioningService,
    @Inject(SESSION_ISSUER) private readonly sessions: SessionIssuer,
    private readonly tokenHasher: TokenHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  async accept(
    token: string,
    body: AcceptInvite,
    principal?: Principal,
  ): Promise<AcceptInviteResult> {
    const now = this.clock.now();
    const invite = await this.invites.findByTokenHash(this.tokenHasher.hash(token));
    if (!invite || !isRedeemable(invite, now)) {
      throw new GoneException('this invitation is no longer valid');
    }
    const organizationId = invite.organizationId;

    const { user, role } = principal
      ? await this.acceptAsSignedIn(organizationId, invite.role, principal)
      : await this.acceptAsNewAccount(organizationId, invite.role, invite.email, body);

    // Consume the invite (single-use) and announce the join (audit seam, D15).
    await this.invites.markAccepted(invite.id, now);
    this.events.emit(
      MemberJoinedEvent.eventName,
      new MemberJoinedEvent(organizationId, user.id, role),
    );

    const workspaceId =
      invite.workspaceId ??
      (await this.orgAccess.getDefaultWorkspaceId(organizationId)) ??
      undefined;

    return this.sessions.issueSession({
      user,
      organizationId,
      role,
      isOrgAdmin: this.orgAccess.isOrgAdminRole(role),
      workspaceId,
    });
  }

  /** A signed-in invitee: add the membership if new, else keep their existing role (idempotent). */
  private async acceptAsSignedIn(
    organizationId: string,
    invitedRole: Role,
    principal: Principal,
  ): Promise<{ user: UserSummary; role: Role }> {
    const user = await this.userProvisioning.findById(principal.userId);
    if (!user) {
      throw new GoneException('this invitation is no longer valid');
    }
    const existingRole = await this.orgAccess.getRoleForUser(organizationId, principal.userId);
    if (existingRole) {
      // Already a member — no duplicate membership (AC4); current role is unchanged.
      return { user, role: existingRole };
    }
    await this.orgAccess.addMember(organizationId, principal.userId, invitedRole);
    return { user, role: invitedRole };
  }

  /** An anonymous invitee accepting an email invite: create the verified account + membership. */
  private async acceptAsNewAccount(
    organizationId: string,
    invitedRole: Role,
    inviteEmail: string | null,
    body: AcceptInvite,
  ): Promise<{ user: UserSummary; role: Role }> {
    if (!inviteEmail) {
      // Shareable-link invites carry no address: the invitee must sign in (or register) first.
      throw new BadRequestException('sign in to accept this invitation');
    }
    if (await this.userProvisioning.findByEmail(inviteEmail)) {
      // The address already has an account — they must sign in to accept (no anon takeover).
      throw new ConflictException('an account already exists for this email — sign in to accept');
    }
    if (!body.name || !body.password) {
      throw new BadRequestException('name and password are required to accept this invitation');
    }
    const user = await this.userProvisioning.createVerifiedUser({
      organizationId,
      email: inviteEmail,
      name: body.name,
      password: body.password,
    });
    await this.orgAccess.addMember(organizationId, user.id, invitedRole);
    return { user, role: invitedRole };
  }
}
