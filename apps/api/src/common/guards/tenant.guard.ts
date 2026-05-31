import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Tenant resolution guard (§4.2). STUB — M0 resolves the org from the principal,
 * performs the membership check, and wraps the handler in
 * `TenantContextService.run({ organizationId })` (via an interceptor/middleware) so
 * repositories auto-scope. Currently a pass-through.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO(M0): resolve org + membership, then establish AsyncLocalStorage context.
    return true;
  }
}
