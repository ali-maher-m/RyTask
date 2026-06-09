import { Injectable } from '@nestjs/common';
import type { ActiveTimer } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { toActiveTimer } from '../domain/time.mapper';
import { TimersRepository } from '../repositories/timers.repository';

/**
 * The caller's active timer, zero or one (US1, research D4 — `GET /timers/active`). Used on page load
 * to re-sync a running timer after a reload or server restart: the row survives (server `CLOCK` is the
 * source of truth), the client re-derives live elapsed from `startedAt`. Tenant-scoped via the repo.
 */
@Injectable()
export class GetActiveTimerProvider {
  constructor(
    private readonly timers: TimersRepository,
    private readonly tenant: TenantContextService,
  ) {}

  async getActive(): Promise<ActiveTimer | null> {
    const userId = this.tenant.getUserId();
    if (!userId) return null;
    const row = await this.timers.findActiveForUser(userId);
    return row ? toActiveTimer(row) : null;
  }
}
