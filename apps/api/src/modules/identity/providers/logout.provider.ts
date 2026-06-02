import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { SessionsRepository } from '../repositories/sessions.repository';

/**
 * Logout (US2, FR-AUTH-002). Revokes the caller's active sessions in the current org so the
 * refresh credential can no longer be used (SC-003). The principal comes from the verified
 * token (ALS) — never from the body.
 */
@Injectable()
export class LogoutProvider {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly tenant: TenantContextService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async logout(): Promise<void> {
    const ctx = this.tenant.get();
    const userId = ctx.userId;
    if (!userId) {
      return;
    }
    await this.sessions.revokeAllForUser(ctx.organizationId, userId, this.clock.now());
  }
}
