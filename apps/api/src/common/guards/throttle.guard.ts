import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { RequestWithPrincipal } from '../auth/principal';
import { type AuthConfigType, authConfig } from '../config/auth.config';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Rate-limiting guard (§6.6, research D12). Redis fixed-window buckets keyed by principal
 * (authenticated) or IP (anonymous), **stricter on `/auth/*`**. Fails **open** when Redis is
 * unavailable — a self-host resilience choice (a down rate-limiter must not take the app down)
 * that also keeps DB-free contract tests running without Redis. Over-limit → 429.
 *
 * The failed-login (email, IP) lockout (SC-011) is enforced in the login provider, which can
 * observe the credential outcome a guard cannot.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(authConfig.KEY) private readonly config: AuthConfigType,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const req = context.switchToHttp().getRequest<RequestWithPrincipal & { url?: string; ip?: string }>();
    const isAuthRoute = (req.url ?? '').includes('/auth/');
    const limit = isAuthRoute
      ? this.config.throttle.authMaxRequests
      : this.config.throttle.maxRequests;
    const windowSeconds = isAuthRoute
      ? this.config.throttle.authWindowSeconds
      : this.config.throttle.windowSeconds;
    const id = req.principal?.userId ?? req.ip ?? 'anon';
    const key = `throttle:${isAuthRoute ? 'auth' : 'gen'}:${id}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      if (count > limit) {
        throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Redis unavailable → fail open (do not block traffic).
      return true;
    }
  }
}
