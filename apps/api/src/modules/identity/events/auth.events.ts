/**
 * Identity domain events (research D15). The future audit-log consumer (v2) subscribes via
 * the event bus — never by reaching into identity internals (Principle III).
 */

export class UserRegisteredEvent {
  static readonly eventName = 'user.registered';
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

export class UserLoggedInEvent {
  static readonly eventName = 'user.loggedIn';
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

/** A Personal Access Token (PAT/MCP) was minted (US7, FR-AUTH-007; audit seam D15). */
export class TokenIssuedEvent {
  static readonly eventName = 'token.issued';
  constructor(
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly tokenId: string,
    public readonly type: string,
  ) {}
}
