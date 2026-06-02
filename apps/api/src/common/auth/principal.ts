import type { Role } from '@rytask/contracts';

/**
 * The authenticated principal (FR-AUTH). M0 verifies a JWT/PAT and resolves this
 * server-side; M1 consumes it (research D0). It is the ONLY source of tenant + identity
 * — never read org/user from a request body or query (Principle II).
 */
export interface Principal {
  userId: string;
  organizationId: string;
  workspaceId?: string;
  /** Org-level admin/owner (from M0 org RBAC) — bypasses project-role checks. */
  isOrgAdmin?: boolean;
  /** The principal's org role (M0). Drives the RBAC permission resolution. */
  role?: Role;
  /** PAT scopes (M0). Empty/undefined for a UI session; effective perms = scope ∩ role. */
  scopes?: string[];
}

/** Request augmented with the resolved principal (set by the context middleware). */
export interface RequestWithPrincipal {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}

// NOTE (research D16): the M1 dev-header resolver (`resolveDevPrincipal`, `x-user-id` /
// `x-organization-id`) was REMOVED in M0/US2. The principal is now resolved only from a
// verified bearer token by `TokenContextMiddleware` → `TokenVerifier`. Tests mint a real
// token via `common/testing/with-principal.ts` (`withPrincipal()`).
