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
