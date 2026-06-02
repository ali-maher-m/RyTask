import { SetMetadata } from '@nestjs/common';
import type { Role } from '@rytask/contracts';
import type { Permission } from './permissions';

/**
 * RBAC route metadata (research D6). The decorators only *declare* intent; `RbacGuard`
 * (US4) reads this metadata and enforces it default-deny. `AuthGuard` (US2) reads
 * `@Public` to skip authentication.
 */

/** Metadata key: route is reachable without a verified principal. */
export const IS_PUBLIC_KEY = 'rbac:public';
/** Metadata key: the permission a route requires. */
export const REQUIRE_PERMISSION_KEY = 'rbac:permission';
/** Metadata key: explicit role allow-list (Owner-only routes use `@Roles('OWNER')`). */
export const ROLES_KEY = 'rbac:roles';

/** Mark a route public (no authentication, no permission check). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Declare the permission a route requires (checked against the principal's role). */
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);

/** Restrict a route to an explicit set of roles (e.g. Owner-only actions). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
