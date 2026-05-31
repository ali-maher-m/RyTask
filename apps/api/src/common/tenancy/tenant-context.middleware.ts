import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type Principal, type RequestWithPrincipal, resolveDevPrincipal } from '../auth/principal';
import { TenantContextService } from './tenant-context.service';

type Next = () => void;

/**
 * Establishes the per-request tenant context in AsyncLocalStorage (§4.2). Middleware
 * is the correct mechanism: it wraps the entire downstream (guards → handler) inside
 * `tenant.run()` so every repository auto-scopes to the principal's org.
 *
 * M1 resolves the principal via the dev seam (`resolveDevPrincipal`); M0 replaces this
 * with verified-token resolution (research D0). Unauthenticated requests pass through
 * with no context — tenant-scoped repositories then fail loudly (and M0's AuthGuard
 * will 401 before they are reached).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenant: TenantContextService) {}

  use(req: RequestWithPrincipal, _res: unknown, next: Next): void {
    const principal: Principal | undefined = req.principal ?? resolveDevPrincipal(req);
    if (!principal) {
      next();
      return;
    }
    req.principal = principal;
    this.tenant.run(
      {
        organizationId: principal.organizationId,
        workspaceId: principal.workspaceId,
        userId: principal.userId,
        isOrgAdmin: principal.isOrgAdmin,
      },
      () => next(),
    );
  }
}
