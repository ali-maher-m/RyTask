import type { AuthResult, Role, UserSummary } from '@rytask/contracts';

/**
 * Public surface of the identity module (Principle III). Other modules depend ONLY on
 * this file. The module is `@Global`, so consumers inject the tokens below. `orgs` uses
 * `SESSION_ISSUER` to sign the owner in during first-run (US1) / on accept-invite (US3),
 * and `IDENTITY_ACCESS` to revoke a removed member's sessions & tokens (US8) — all without
 * importing identity's repositories or `@rytask/db` rows (only `@rytask/contracts` types).
 */

/** Parameters for issuing a session (the bootstrap/login shared primitive, research D3). */
export interface IssueSessionParams {
  user: UserSummary;
  organizationId: string;
  role: Role;
  isOrgAdmin: boolean;
  workspaceId?: string;
  scopes?: string[];
  /** Reuse a rotation family (refresh); omit to start a new one. */
  familyId?: string;
  userAgent?: string | null;
  ip?: string | null;
}

/** DI token for the cross-module session issuer. */
export const SESSION_ISSUER = Symbol('SESSION_ISSUER');

export interface SessionIssuer {
  /** Mint an access token + opaque refresh session and return the auth result. */
  issueSession(params: IssueSessionParams): Promise<AuthResult>;
}

/** DI token for cross-module session/token revocation. */
export const IDENTITY_ACCESS = Symbol('IDENTITY_ACCESS');

export interface IdentityAccessService {
  /** Revoke every active session (and PAT, US7) for a user in an org (member removal, US8). */
  revokeAllForUser(organizationId: string, userId: string): Promise<void>;
}

/** DI token for cross-module user provisioning (orgs accept-invite owns membership, not users). */
export const USER_PROVISIONING = Symbol('USER_PROVISIONING');

export interface CreateVerifiedUserParams {
  organizationId: string;
  email: string;
  name: string;
  password: string;
}

/**
 * Identity owns the `users` table; `orgs` accept-invite (US3) needs to look up or create the
 * account behind a membership without importing identity's repositories (Principle III). All
 * inputs/outputs are `@rytask/contracts` types — never `@rytask/db` rows.
 */
export interface UserProvisioningService {
  /** Global find-by-email (the invitee may already have an account), or null. */
  findByEmail(email: string): Promise<UserSummary | null>;
  /** Global find-by-id (a signed-in invitee accepting via their bearer token), or null. */
  findById(id: string): Promise<UserSummary | null>;
  /** Global find-by-ids — hydrate a member list with user summaries (US8). */
  findByIds(ids: string[]): Promise<UserSummary[]>;
  /** Create an email-verified account for an org (a brand-new invitee accepting an email invite). */
  createVerifiedUser(params: CreateVerifiedUserParams): Promise<UserSummary>;
}
