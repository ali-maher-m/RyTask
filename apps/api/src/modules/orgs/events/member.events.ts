/**
 * Membership lifecycle events (research D15). The future audit-log consumer (v2) subscribes
 * via the event bus — never by reaching into orgs internals (Principle III). `MemberInvited`
 * fires on invite creation; `MemberJoined` on successful acceptance (US3, FR-AUTH-011).
 */

export class MemberInvitedEvent {
  static readonly eventName = 'member.invited';
  constructor(
    public readonly organizationId: string,
    public readonly invitationId: string,
    public readonly email: string | null,
    public readonly role: string,
    public readonly invitedByUserId: string | null,
  ) {}
}

export class MemberJoinedEvent {
  static readonly eventName = 'member.joined';
  constructor(
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly role: string,
  ) {}
}

/**
 * A member's org role changed (US4 scaffolding; emitted when role changes land in US8). The
 * audit-log consumer + the session/permission-refresh path subscribe to this (research D15;
 * a role change takes effect on the next request via the re-resolved principal — SC-007).
 */
export class RoleChangedEvent {
  static readonly eventName = 'member.roleChanged';
  constructor(
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly fromRole: string,
    public readonly toRole: string,
    public readonly changedByUserId: string,
  ) {}
}
