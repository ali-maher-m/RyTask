import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY, REQUIRE_PERMISSION_KEY, ROLES_KEY } from '../rbac/decorators';
import { RbacGuard } from './rbac.guard';

/**
 * Unit tests for the RbacGuard decision logic (T071, US4, FR-RBAC-002, SC-005). Drives the
 * guard with a stub Reflector + ExecutionContext: `@Public` bypass, default-deny when a
 * protected route declares nothing satisfiable, `@Roles` allow-lists, and `@RequirePermission`
 * resolution against the role catalog. The full HTTP matrix is covered by `authz-matrix.spec`.
 */
interface Meta {
  [IS_PUBLIC_KEY]?: boolean;
  [REQUIRE_PERMISSION_KEY]?: string;
  [ROLES_KEY]?: string[];
}

const makeContext = (principal: unknown, type: 'http' | 'ws' = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class Stub {},
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  }) as unknown as ExecutionContext;

const guardWith = (meta: Meta): RbacGuard =>
  new RbacGuard({
    getAllAndOverride: (key: string) => (meta as Record<string, unknown>)[key],
  } as unknown as Reflector);

describe('RbacGuard', () => {
  it('passes through non-HTTP contexts (WebSocket handles its own auth)', () => {
    expect(guardWith({}).canActivate(makeContext(undefined, 'ws'))).toBe(true);
  });

  it('allows @Public routes with no principal', () => {
    expect(guardWith({ [IS_PUBLIC_KEY]: true }).canActivate(makeContext(undefined))).toBe(true);
  });

  it('401s a protected route with no principal / no role', () => {
    expect(() =>
      guardWith({ [REQUIRE_PERMISSION_KEY]: 'org:read' }).canActivate(makeContext(undefined)),
    ).toThrow(UnauthorizedException);
    expect(() =>
      guardWith({ [REQUIRE_PERMISSION_KEY]: 'org:read' }).canActivate(makeContext({ userId: 'u' })),
    ).toThrow(UnauthorizedException);
  });

  it('default-denies a protected route that declares nothing satisfiable (SC-005)', () => {
    expect(() => guardWith({}).canActivate(makeContext({ role: 'OWNER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('honors @RequirePermission against the role catalog', () => {
    expect(
      guardWith({ [REQUIRE_PERMISSION_KEY]: 'members:invite' }).canActivate(
        makeContext({ role: 'ADMIN' }),
      ),
    ).toBe(true);
    expect(() =>
      guardWith({ [REQUIRE_PERMISSION_KEY]: 'work:write' }).canActivate(
        makeContext({ role: 'VIEWER' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('honors @Roles allow-lists (Owner-only)', () => {
    expect(guardWith({ [ROLES_KEY]: ['OWNER'] }).canActivate(makeContext({ role: 'OWNER' }))).toBe(
      true,
    );
    expect(() =>
      guardWith({ [ROLES_KEY]: ['OWNER'] }).canActivate(makeContext({ role: 'ADMIN' })),
    ).toThrow(ForbiddenException);
  });
});
