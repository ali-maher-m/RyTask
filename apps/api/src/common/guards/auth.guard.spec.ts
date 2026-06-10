import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../rbac/decorators';
import { AuthGuard } from './auth.guard';

/**
 * Unit tests for the AuthGuard decision logic (US2, FR-AUTH). Drives the guard with a stub
 * Reflector + ExecutionContext: non-HTTP pass-through, `@Public` bypass, 401 when a protected
 * route has no verified principal, and pass when one is attached.
 */
const makeContext = (principal: unknown, type: 'http' | 'ws' = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class Stub {},
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  }) as unknown as ExecutionContext;

const guardWith = (meta: Record<string, unknown>): AuthGuard =>
  new AuthGuard({ getAllAndOverride: (key: string) => meta[key] } as unknown as Reflector);

describe('AuthGuard', () => {
  it('passes through non-HTTP contexts (WebSocket handles its own auth)', () => {
    expect(guardWith({}).canActivate(makeContext(undefined, 'ws'))).toBe(true);
  });

  it('allows @Public routes with no principal', () => {
    expect(guardWith({ [IS_PUBLIC_KEY]: true }).canActivate(makeContext(undefined))).toBe(true);
  });

  it('401s a protected route with no principal', () => {
    expect(() => guardWith({}).canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });

  it('allows a protected route with a verified principal', () => {
    expect(guardWith({}).canActivate(makeContext({ userId: 'u', role: 'OWNER' }))).toBe(true);
  });
});
