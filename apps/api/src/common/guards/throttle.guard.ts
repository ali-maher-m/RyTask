import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

/**
 * Rate-limiting guard (§6.6). STUB — M0 enforces per-principal/IP rate limits backed
 * by Redis buckets. Not globally bound yet.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // TODO(M0): enforce Redis-backed rate-limit buckets.
    return true;
  }
}
