import type { Role } from '@rytask/contracts';

/**
 * The RBAC permission catalog (contracts/rbac-matrix.md, research D6). Maps each built-in
 * org `role_type` to the set of permissions it holds. `RbacGuard` (US4) reads a route's
 * required permission from `@RequirePermission` metadata and checks it here, **default-deny**.
 *
 * The M0 matrix permissions are exact; `work:read` / `work:write` are the coarse org-level
 * gate the M1 retrofit (T077) attaches to existing routes so an org `VIEWER` is globally
 * read-only (SC-006). Finer project-role enforcement still happens downstream in M1's
 * `ProjectAccessService` (org `OWNER`/`ADMIN` bypass it via `isOrgAdmin`).
 */
export const PERMISSIONS = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'members:read',
  'org:settings:write',
  'members:invite',
  'members:write',
  'org:delete',
  'org:transfer',
  'work:read',
  'work:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER: Permission[] = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'members:read',
  'org:settings:write',
  'members:invite',
  'members:write',
  'org:delete',
  'org:transfer',
  'work:read',
  'work:write',
];

const ADMIN: Permission[] = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'members:read',
  'org:settings:write',
  'members:invite',
  'members:write',
  'work:read',
  'work:write',
];

const MEMBER: Permission[] = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'members:read',
  'work:read',
  'work:write',
];

const GUEST: Permission[] = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'work:read',
];

const VIEWER: Permission[] = [
  'self',
  'tokens:read',
  'tokens:write',
  'org:read',
  'workspace:read',
  'members:read',
  'work:read',
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  MEMBER: new Set(MEMBER),
  GUEST: new Set(GUEST),
  VIEWER: new Set(VIEWER),
};

/** Org roles that bypass project-role checks (research D6). */
export const isOrgAdminRole = (role: Role): boolean => role === 'OWNER' || role === 'ADMIN';

/** The permission set held by a role. */
export const permissionsForRole = (role: Role): ReadonlySet<Permission> => ROLE_PERMISSIONS[role];

/** Pure: does `role` hold `permission`? (default-deny — unknown role/permission → false). */
export const roleHasPermission = (role: Role, permission: string): boolean =>
  ROLE_PERMISSIONS[role]?.has(permission as Permission) ?? false;
