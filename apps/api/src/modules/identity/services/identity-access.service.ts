import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import type { IdentityAccessService } from '../identity.contract';
import { ApiTokensRepository } from '../repositories/api-tokens.repository';
import { SessionsRepository } from '../repositories/sessions.repository';

/**
 * Cross-module identity access (data-model §4). Lets `orgs` revoke a removed/role-changed
 * member's credentials without importing identity's repositories (US8): both their refresh
 * sessions and their PATs/MCP tokens are revoked so access ends immediately (US8 AC3).
 */
@Injectable()
export class IdentityAccessServiceImpl implements IdentityAccessService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly apiTokens: ApiTokensRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async revokeAllForUser(organizationId: string, userId: string): Promise<void> {
    const now = this.clock.now();
    await this.sessions.revokeAllForUser(organizationId, userId, now);
    await this.apiTokens.revokeAllForUser(organizationId, userId, now);
  }
}
