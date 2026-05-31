import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenantContext {
  organizationId: string;
  workspaceId?: string;
}

/**
 * Propagates the resolved tenant through the request via AsyncLocalStorage (§4.2).
 * `TenantGuard` (M0) resolves the org from the principal and wraps the handler in
 * `run()`; repositories read `getOrgId()` to scope every query.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.als.run(context, fn);
  }

  get(): TenantContext {
    const ctx = this.als.getStore();
    if (!ctx) {
      throw new Error('No tenant context: the request must pass through TenantGuard first.');
    }
    return ctx;
  }

  getOrgId(): string {
    return this.get().organizationId;
  }
}
