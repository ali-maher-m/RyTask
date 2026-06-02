import type { Role } from '@rytask/contracts';
import {
  type Permission,
  isOrgAdminRole,
  permissionsForRole,
  roleHasPermission,
} from '../../../common/rbac/permissions';

/**
 * Role → permission resolution for the orgs domain (research D6, rbac-matrix.md). A thin,
 * pure wrapper over the shared `common/rbac` catalog so there is exactly ONE source of truth:
 * `RbacGuard` resolves the same catalog from the principal's role on the hot path (no DB hit,
 * D6), while this policy gives the orgs module + the authorization-matrix test (T072) a
 * domain-level view. Default-deny is inherited from the catalog (unknown role/perm → false).
 */

/** Owner-only permissions — require exactly `OWNER`, not merely org-admin (rbac-matrix §22-23). */
const OWNER_ONLY: ReadonlySet<Permission> = new Set(['org:delete', 'org:transfer']);

/** Is this an Owner-only action (`@Roles('OWNER')`-gated)? */
export const isOwnerOnly = (permission: Permission): boolean => OWNER_ONLY.has(permission);

/** Does `role` satisfy `permission`? Default-deny. */
export const roleSatisfies = (role: Role, permission: Permission): boolean =>
  roleHasPermission(role, permission);

/** Org roles (OWNER/ADMIN) that bypass project-role checks on retrofitted M1 routes. */
export { isOrgAdminRole };

/** The full permission set a role holds (introspection / whoami). */
export { permissionsForRole };
