import type { Role } from '@rytask/contracts';
import { authConfig } from '../config/auth.config';
import { isOrgAdminRole } from '../rbac/permissions';
import { TokenSigner } from '../../modules/identity/services/token-signer.service';

/**
 * Test-only principal helper (research D16). Mints a **real** access token for a seeded
 * user and returns the `Authorization` header value, replacing the M1 dev-header seam
 * (`x-user-id` / `x-organization-id`). Signed via the same {@link TokenSigner} + config the
 * app uses, so the middleware's `TokenVerifier` accepts it with no DB round-trip.
 *
 * Usage (supertest):
 *   request(app).get('/api/v1/...').set('authorization', withPrincipal({ userId, organizationId }))
 */
export interface PrincipalOptions {
  userId: string;
  organizationId: string;
  /** Defaults to OWNER (the seeded founder) — covers M1 admin-path tests. */
  role?: Role;
  /** Defaults to derived from `role` (OWNER/ADMIN ⇒ true). */
  isOrgAdmin?: boolean;
  workspaceId?: string;
  scopes?: string[];
}

/** Sign a real access token for the given principal (no Bearer prefix). */
export function signAccessToken(opts: PrincipalOptions): string {
  const role: Role = opts.role ?? 'OWNER';
  const signer = new TokenSigner(authConfig());
  return signer.sign({
    sub: opts.userId,
    org: opts.organizationId,
    wsp: opts.workspaceId,
    role,
    adm: opts.isOrgAdmin ?? isOrgAdminRole(role),
    scopes: opts.scopes ?? [],
    ver: 0,
  });
}

/** The `Authorization` header value (`Bearer <jwt>`) for a real principal. */
export function withPrincipal(opts: PrincipalOptions): string {
  return `Bearer ${signAccessToken(opts)}`;
}
