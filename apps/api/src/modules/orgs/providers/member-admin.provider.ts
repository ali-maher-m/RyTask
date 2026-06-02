import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  Membership,
  Organization,
  Role,
  TransferOwnership,
  UpdateOrgSettings,
} from '@rytask/contracts';
import type { Principal } from '../../../common/auth/principal';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import {
  IDENTITY_ACCESS,
  type IdentityAccessService,
  USER_PROVISIONING,
  type UserProvisioningService,
} from '../../identity/identity.contract';
import { adminCannotActOnOwner, wouldRemoveLastOwner } from '../domain/last-owner.policy';
import { RoleChangedEvent } from '../events/member.events';
import { MembershipsRepository } from '../repositories/memberships.repository';
import { OrganizationsRepository } from '../repositories/organizations.repository';
import { toMembershipDto, toOrgDto } from './org.mapper';

/**
 * Org + member administration (US8, FR-TEN-004/FR-RBAC-003, research D13/D14). Owner/Admin
 * edit settings + manage members; Owner-only transfer/soft-delete. Invariants enforced via
 * {@link wouldRemoveLastOwner} / {@link adminCannotActOnOwner} (409/403). Removing a member —
 * and soft-deleting the org — revokes the affected users' sessions **and** PATs through the
 * identity `IDENTITY_ACCESS` port so access ends at once (AC3). A role change emits
 * `RoleChanged` and takes effect on the holder's next access-token refresh (≤15 min TTL;
 * PAT-borne principals re-resolve the role on every request, so they update immediately).
 */
@Injectable()
export class MemberAdminProvider {
  constructor(
    private readonly memberships: MembershipsRepository,
    private readonly organizations: OrganizationsRepository,
    @Inject(IDENTITY_ACCESS) private readonly identityAccess: IdentityAccessService,
    @Inject(USER_PROVISIONING) private readonly users: UserProvisioningService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  /** List members (role + user summary) for the current org. */
  async listMembers(): Promise<Membership[]> {
    const rows = await this.memberships.list();
    const users = await this.users.findByIds(rows.map((r) => r.userId));
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows
      .map((r) => {
        const user = byId.get(r.userId);
        return user ? toMembershipDto(r, user) : null;
      })
      .filter((m): m is Membership => m !== null);
  }

  /** Partial update of org settings (merged onto the current settings). */
  async updateSettings(input: UpdateOrgSettings): Promise<Organization> {
    const org = await this.organizations.current();
    if (!org) {
      throw new NotFoundException('organization not found');
    }
    const row = await this.organizations.updateSettings({ ...(org.settings ?? {}), ...input });
    if (!row) {
      throw new NotFoundException('organization not found');
    }
    return toOrgDto(row);
  }

  /** Owner-only soft-delete: mark the org deleted and revoke every member's credentials (D14). */
  async softDeleteOrg(): Promise<void> {
    const now = this.clock.now();
    const members = await this.memberships.list();
    await this.organizations.softDelete(now);
    for (const member of members) {
      await this.identityAccess.revokeAllForUser(member.organizationId, member.userId);
    }
  }

  /** Change a member's role (Admin+; last-owner + admin-vs-owner protected). */
  async setMemberRole(actor: Principal, targetUserId: string, newRole: Role): Promise<Membership> {
    const targetRole = await this.memberships.findRole(targetUserId);
    if (!targetRole) {
      throw new NotFoundException('member not found');
    }
    this.assertCanAct(actor, targetRole);
    if (
      wouldRemoveLastOwner({
        targetCurrentRole: targetRole,
        activeOwnerCount: await this.memberships.countActiveOwners(),
        isRemoval: false,
        newRole,
      })
    ) {
      throw new ConflictException('cannot demote the last owner');
    }
    const updated = await this.memberships.setRole(targetUserId, newRole);
    if (!updated) {
      throw new NotFoundException('member not found');
    }
    this.events.emit(
      RoleChangedEvent.eventName,
      new RoleChangedEvent(actor.organizationId, targetUserId, targetRole, newRole, actor.userId),
    );
    const user = await this.users.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('member not found');
    }
    return toMembershipDto(updated, user);
  }

  /** Remove a member (Admin+; last-owner protected) and revoke their sessions + tokens. */
  async removeMember(actor: Principal, targetUserId: string): Promise<void> {
    const targetRole = await this.memberships.findRole(targetUserId);
    if (!targetRole) {
      throw new NotFoundException('member not found');
    }
    this.assertCanAct(actor, targetRole);
    if (
      wouldRemoveLastOwner({
        targetCurrentRole: targetRole,
        activeOwnerCount: await this.memberships.countActiveOwners(),
        isRemoval: true,
      })
    ) {
      throw new ConflictException('cannot remove the last owner');
    }
    await this.memberships.setDeactivated(targetUserId, this.clock.now());
    await this.identityAccess.revokeAllForUser(actor.organizationId, targetUserId);
  }

  /**
   * Owner-only ownership transfer (FR-RBAC-003). Promotes the target to OWNER first (so ≥1
   * Owner always exists), then optionally demotes the acting owner — attributable via the
   * emitted `RoleChanged` events. 409 if the target is not an eligible active member.
   */
  async transferOwnership(actor: Principal, input: TransferOwnership): Promise<void> {
    const targetRole = await this.memberships.findRole(input.toUserId);
    if (!targetRole) {
      throw new ConflictException('target is not an eligible member');
    }
    await this.memberships.setRole(input.toUserId, 'OWNER');
    this.events.emit(
      RoleChangedEvent.eventName,
      new RoleChangedEvent(actor.organizationId, input.toUserId, targetRole, 'OWNER', actor.userId),
    );
    if (input.demoteSelfTo && input.demoteSelfTo !== 'OWNER') {
      await this.memberships.setRole(actor.userId, input.demoteSelfTo);
      this.events.emit(
        RoleChangedEvent.eventName,
        new RoleChangedEvent(
          actor.organizationId,
          actor.userId,
          'OWNER',
          input.demoteSelfTo,
          actor.userId,
        ),
      );
    }
  }

  /** An Admin may not act on an Owner (only an Owner can). */
  private assertCanAct(actor: Principal, targetRole: Role): void {
    if (actor.role && adminCannotActOnOwner(actor.role, targetRole)) {
      throw new ForbiddenException('admins cannot modify an owner');
    }
  }
}
