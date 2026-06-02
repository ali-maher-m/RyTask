import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithPrincipal } from '../auth/principal';
import { IS_PUBLIC_KEY } from '../rbac/decorators';

/**
 * AuthN guard (FR-AUTH, US2). Rejects requests with no verified principal (401) unless the
 * route is `@Public`. The principal is resolved + attached by `TenantContextMiddleware`
 * (which verifies the bearer JWT/PAT before guards run, research D4). Non-HTTP contexts
 * (WebSocket) handle their own auth and are passed through.
 */
@Injectable()
export class AuthGuard implements CanActivate {
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
    if (!req.principal) {
      throw new UnauthorizedException('authentication required');
    }
    return true;
  }
}
