import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithPrincipal } from '../auth/principal';
import { IS_PUBLIC_KEY } from '../rbac/decorators';
import { TenantContextService } from '../tenancy/tenant-context.service';

/**
 * Tenant resolution guard (§4.2, Principle II, research D10). The org is resolved **only**
 * from the verified principal — never from a request body, query, or header — and the guard
 * asserts the principal is an active member of that org. The AsyncLocalStorage tenant context
 * was already established by `TenantContextMiddleware` (which wraps the whole guard chain +
 * handler in `tenant.run()`); this guard verifies it is present and consistent so every
 * downstream repository auto-scopes to the right org.
 *
 * Active membership is asserted from the signed token (it carries the role; a deactivated /
 * removed member's sessions are revoked, so they cannot present a valid token) — no DB hit on
 * the hot path. A cross-org id is handled by repository scoping (→ 404, existence never
 * leaked), not here. The cross-tenant isolation suite (T079) proves the end-to-end guarantee.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContextService,
  ) {}

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
    if (!principal) {
      throw new UnauthorizedException('authentication required');
    }

    // Active membership is implied by a valid token carrying an org role (Principle II).
    if (!principal.organizationId || !principal.role) {
      throw new ForbiddenException('not an active member of this organization');
    }

    // The middleware must have established the ALS context from this same principal.
    const ctx = this.tenant.maybe();
    if (!ctx || ctx.organizationId !== principal.organizationId) {
      throw new ForbiddenException('tenant context not established');
    }

    return true;
  }
}
