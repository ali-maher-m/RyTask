import type { Role } from '@rytask/contracts';
import { SCOPE_WILDCARD, patHasPermission } from '../../../common/rbac/permissions';

/**
 * PAT/MCP scope resolution for the identity domain (research D5, FR-RBAC-009). A thin, pure
 * wrapper over the shared `common/rbac` catalog so the RbacGuard and this policy resolve the
 * exact same rule: **effective permission = token scope ∩ holder's role**. An out-of-scope
 * call is denied even if the role allows it; a beyond-role call is denied even if the scope
 * would. An empty scope list (or the `*` wildcard) means full delegation of the role.
 */

export { SCOPE_WILDCARD };

/** Does a PAT with `scopes`, held by `role`, satisfy `permission`? */
export const scopeSatisfies = (
  role: Role,
  scopes: readonly string[],
  permission: string,
): boolean => patHasPermission(role, scopes, permission);
