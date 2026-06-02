import { Injectable, type NestMiddleware } from '@nestjs/common';
import { TokenVerifier } from '../../modules/identity/services/token-verifier.service';
import type { RequestWithPrincipal } from '../auth/principal';
import { TenantContextService } from './tenant-context.service';

type Next = () => void;

/**
 * Establishes the per-request tenant context in AsyncLocalStorage (§4.2, research D4).
 * Middleware is the correct mechanism: it wraps the entire downstream (guards → handler)
 * inside `tenant.run()` so every repository auto-scopes to the principal's org.
 *
 * M0/US2: verifies the bearer credential (JWT/PAT) via {@link TokenVerifier} and attaches
 * the principal. The M1 dev-header seam (`resolveDevPrincipal`) is **gone** from the runtime
 * (research D16) — tests use the `withPrincipal()` helper (a real token) instead.
 * Unauthenticated requests pass through with no context; `AuthGuard` then 401s (unless `@Public`).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenant: TenantContextService,
    private readonly verifier: TokenVerifier,
  ) {}

  async use(req: RequestWithPrincipal, _res: unknown, next: Next): Promise<void> {
    const raw = req.headers.authorization;
    const authHeader = Array.isArray(raw) ? raw[0] : raw;
    const principal = await this.verifier.verify(authHeader);
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
