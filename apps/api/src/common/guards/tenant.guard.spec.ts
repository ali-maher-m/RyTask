import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../rbac/decorators';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { TenantGuard } from './tenant.guard';

/**
 * Unit tests for the TenantGuard decision logic (Principle II, research D10). The org is taken
 * ONLY from the verified principal; the guard asserts an active-member token (org + role) and
 * that the ALS context established by the middleware matches that principal's org.
 */
const makeContext = (principal: unknown, type: 'http' | 'ws' = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    getHandler: () => () => undefined,
    getClass: () => class Stub {},
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  }) as unknown as ExecutionContext;

const reflector = (meta: Record<string, unknown>): Reflector =>
  ({ getAllAndOverride: (key: string) => meta[key] }) as unknown as Reflector;

const guard = (tenant: TenantContextService, meta: Record<string, unknown> = {}): TenantGuard =>
  new TenantGuard(reflector(meta), tenant);

const member = { userId: 'u-1', organizationId: 'org-1', role: 'MEMBER' as const };

describe('TenantGuard', () => {
  it('passes through non-HTTP contexts', () => {
    const tenant = new TenantContextService();
    expect(guard(tenant).canActivate(makeContext(undefined, 'ws'))).toBe(true);
  });

  it('allows @Public routes', () => {
    const tenant = new TenantContextService();
    expect(guard(tenant, { [IS_PUBLIC_KEY]: true }).canActivate(makeContext(undefined))).toBe(true);
  });

  it('401s with no principal', () => {
    const tenant = new TenantContextService();
    expect(() => guard(tenant).canActivate(makeContext(undefined))).toThrow(UnauthorizedException);
  });

  it('403s a principal that carries no org/role (not an active member)', () => {
    const tenant = new TenantContextService();
    expect(() =>
      tenant.run({ organizationId: 'org-1' }, () =>
        guard(tenant).canActivate(makeContext({ userId: 'u-1' })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('403s when no ALS tenant context was established', () => {
    const tenant = new TenantContextService();
    // Called OUTSIDE tenant.run → maybe() is undefined.
    expect(() => guard(tenant).canActivate(makeContext(member))).toThrow(ForbiddenException);
  });

  it('403s when the ALS org does not match the principal org', () => {
    const tenant = new TenantContextService();
    expect(() =>
      tenant.run({ organizationId: 'org-2' }, () => guard(tenant).canActivate(makeContext(member))),
    ).toThrow(ForbiddenException);
  });

  it('allows a member whose token org matches the established ALS context', () => {
    const tenant = new TenantContextService();
    const ok = tenant.run({ organizationId: 'org-1', userId: 'u-1' }, () =>
      guard(tenant).canActivate(makeContext(member)),
    );
    expect(ok).toBe(true);
  });
});
