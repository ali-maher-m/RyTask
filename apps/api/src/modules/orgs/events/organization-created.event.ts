/**
 * Published on first-run bootstrap (research D7/D15). The future audit-log consumer (v2)
 * subscribes via the event bus — never by reaching into orgs internals (Principle III).
 */
export class OrganizationCreatedEvent {
  static readonly eventName = 'organization.created';

  constructor(
    public readonly organizationId: string,
    public readonly ownerUserId: string,
    public readonly workspaceId: string,
  ) {}
}
