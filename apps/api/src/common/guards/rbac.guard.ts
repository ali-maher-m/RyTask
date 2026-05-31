import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Role-based access guard (FR-RBAC). STUB — M0 enforces role/permission checks per
 * route. Not globally bound yet (RBAC is applied per route in M0+).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO(M0): enforce the caller's role/permissions for the route.
    return true;
  }
}
