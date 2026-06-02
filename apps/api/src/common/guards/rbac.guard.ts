import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@rytask/contracts';
import type { RequestWithPrincipal } from '../auth/principal';
import { IS_PUBLIC_KEY, REQUIRE_PERMISSION_KEY, ROLES_KEY } from '../rbac/decorators';
import { type Permission, patHasPermission } from '../rbac/permissions';

/**
 * Role-based access guard (FR-RBAC-001/002/003/007, Principle VI, research D6). Reads the
 * route's `@RequirePermission` / `@Roles` metadata and checks it against the **verified
 * principal's** role (resolved from the JWT — no DB hit on the hot path). Enforcement is
 * **default-deny**: a non-`@Public` route with no satisfiable permission is refused (SC-005).
 *
 * The role-level check is the coarse org gate; finer project-role enforcement (and the
 * `OWNER`/`ADMIN` `isOrgAdmin` bypass) stays in M1's `ProjectAccessService`, which reads the
 * same principal from the tenant context. For PAT/MCP principals the effective permission is
 * **scope ∩ role** (US7) — a UI session carries empty scopes, which resolves to the full role.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = req.principal;
    if (!principal?.role) {
      // AuthGuard already 401s a missing principal; a principal with no role can't be authorized.
      throw new UnauthorizedException('authentication required');
    }
    const role = principal.role;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permission = this.reflector.getAllAndOverride<Permission>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Default-deny: a protected route must declare what it requires.
    if ((!roles || roles.length === 0) && !permission) {
      throw new ForbiddenException('forbidden');
    }

    // Explicit role allow-list (e.g. Owner-only actions: `@Roles('OWNER')`).
    if (roles && roles.length > 0 && !roles.includes(role)) {
      throw new ForbiddenException('forbidden');
    }

    // Required permission, resolved as scope ∩ role (empty scopes = full role; default-deny).
    if (permission && !patHasPermission(role, principal.scopes ?? [], permission)) {
      throw new ForbiddenException('forbidden');
    }

    return true;
  }
}
