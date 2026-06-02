import { GoneException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CreateInvite, Invitation, InvitationCreated, InvitePreview } from '@rytask/contracts';
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { type AuthConfigType, authConfig } from '../../../common/config/auth.config';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { MAILER, type MailerPort } from '../../../common/ports/mailer.port';
import { inviteExpiresAt, isRedeemable, normalizeInviteEmail } from '../domain/invitation.policy';
import { MemberInvitedEvent } from '../events/member.events';
import { InvitationsRepository } from '../repositories/invitations.repository';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { toInvitationDto } from './org.mapper';

/** Opaque invite-token prefix (human-recognizable; the plaintext is shown once in the URL). */
const INVITE_TOKEN_PREFIX = 'rytask_inv_';

/**
 * Invitation management (US3, FR-AUTH-011, research D8). Owner/Admin creates an email or
 * shareable-link invite at a pre-assigned role; the secret token is returned once in the
 * accept URL and stored only as a keyed hash (SC-002). `preview` is the public read shown
 * before accepting. Acceptance itself lives in {@link AcceptInviteProvider}.
 */
@Injectable()
export class InviteProvider {
  constructor(
    private readonly invites: InvitationsRepository,
    private readonly orgs: OrganizationsRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(MAILER) private readonly mailer: MailerPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
    private readonly events: EventEmitter2,
  ) {}

  /** Create an email or shareable-link invite; emails the link and returns the accept URL. */
  async create(principal: Principal, input: CreateInvite): Promise<InvitationCreated> {
    const now = this.clock.now();
    const email = normalizeInviteEmail(input.email ?? null);

    // One live invite per address (the partial-unique index enforces this): supersede an
    // existing live invite so re-inviting simply refreshes the link rather than 500-ing.
    if (email) {
      const live = await this.invites.findLiveByEmail(email, now);
      if (live) {
        await this.invites.revoke(live.id, now);
      }
    }

    const token = this.tokenHasher.generate(INVITE_TOKEN_PREFIX);
    const created = await this.invites.create({
      organizationId: principal.organizationId,
      email,
      role: input.role,
      workspaceId: input.workspaceId ?? null,
      tokenHash: this.tokenHasher.hash(token),
      invitedByUserId: principal.userId,
      expiresAt: inviteExpiresAt(now, input.expiresInHours),
    });

    const acceptUrl = `${this.config.appBaseUrl}/invite/${token}`;
    if (email) {
      await this.mailer.send({
        to: email,
        subject: "You've been invited to RyTask",
        body: `You've been invited to join as ${input.role}. Accept your invitation: ${acceptUrl}`,
      });
    }

    this.events.emit(
      MemberInvitedEvent.eventName,
      new MemberInvitedEvent(
        created.organizationId,
        created.id,
        email,
        input.role,
        principal.userId,
      ),
    );

    return { ...toInvitationDto(created), acceptUrl };
  }

  /** Pending invites for the current org (Admin+ list). */
  async list(): Promise<Invitation[]> {
    const rows = await this.invites.listPending(this.clock.now());
    return rows.map(toInvitationDto);
  }

  /** Public preview (org name + role) shown before accepting; 410 if the invite isn't live. */
  async preview(token: string): Promise<InvitePreview> {
    const now = this.clock.now();
    const invite = await this.invites.findByTokenHash(this.tokenHasher.hash(token));
    if (!invite || !isRedeemable(invite, now)) {
      throw new GoneException('this invitation is no longer valid');
    }
    const org = await this.orgs.findById(invite.organizationId);
    if (!org) {
      throw new GoneException('this invitation is no longer valid');
    }
    return { organizationName: org.name, role: invite.role, email: invite.email };
  }

  /** Revoke a pending invite (404 if not found / not pending in the current org). */
  async revoke(id: string): Promise<void> {
    const ok = await this.invites.revoke(id, this.clock.now());
    if (!ok) {
      throw new NotFoundException('invitation not found');
    }
  }
}
