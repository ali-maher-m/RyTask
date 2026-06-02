import type { Role, Workspace } from '@rytask/contracts';

/**
 * Public surface of the orgs module (Principle III). Other modules depend ONLY on this
 * file — never on orgs' repositories/services. The module is `@Global`, so consumers
 * inject the token below. `identity` uses this to resolve a user's org role + workspaces
 * when building the principal / whoami (data-model §4), without importing orgs' internals.
 */

/** DI token for the cross-module org access service. */
export const ORG_ACCESS = Symbol('ORG_ACCESS');

/** Role + workspace resolution for cross-context callers (research D6, FR-INT-MCP-001). */
export interface OrgAccessService {
  /** A user's active org role (null if not a member or deactivated). */
  getRoleForUser(organizationId: string, userId: string): Promise<Role | null>;
  /** Is the user an active member of the org? */
  isActiveMember(organizationId: string, userId: string): Promise<boolean>;
  /** Org roles (OWNER/ADMIN) that bypass project-role checks. */
  isOrgAdminRole(role: Role): boolean;
  /** The org's default (first) workspace id, stamped into the session at login. */
  getDefaultWorkspaceId(organizationId: string): Promise<string | null>;
  /** Workspaces in the org (for `whoami`). */
  listWorkspaces(organizationId: string): Promise<Workspace[]>;
  /** Public-signup context for the single-org instance (register gate, D8), or null. */
  getSignupContext(): Promise<SignupContext | null>;
  /** Create an org membership at a role (orgs owns memberships; used by register/accept). */
  addMember(organizationId: string, userId: string, role: Role): Promise<void>;
}

export interface SignupContext {
  organizationId: string;
  allowPublicSignup: boolean;
  defaultWorkspaceId: string | null;
}
