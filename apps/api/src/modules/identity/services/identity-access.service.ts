import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import type { IdentityAccessService } from '../identity.contract';
import { SessionsRepository } from '../repositories/sessions.repository';

/**
 * Cross-module identity access (data-model §4). Lets `orgs` revoke a removed/role-changed
 * member's credentials without importing identity's repositories (US8). PAT revocation is
 * layered in once the api-tokens repository lands (US7).
 */
@Injectable()
export class IdentityAccessServiceImpl implements IdentityAccessService {
  constructor(
    private readonly sessions: SessionsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async revokeAllForUser(organizationId: string, userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(organizationId, userId, this.clock.now());
  }
}
