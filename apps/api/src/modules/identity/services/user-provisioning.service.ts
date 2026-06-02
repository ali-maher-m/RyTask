import { Inject, Injectable } from '@nestjs/common';
import type { UserSummary } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import type { CreateVerifiedUserParams, UserProvisioningService } from '../identity.contract';
import { toUserSummary } from '../providers/user.mapper';
import { UsersRepository } from '../repositories/users.repository';

/**
 * Cross-module user provisioning (data-model §4). Lets `orgs` accept-invite (US3) resolve or
 * create the account behind a new membership without importing identity's repositories — it
 * injects {@link UserProvisioningService} via the `USER_PROVISIONING` token (Principle III).
 * Accounts created here are email-verified: the invitee proved control of the address by
 * following the emailed/shared link (research D8/D9).
 */
@Injectable()
export class UserProvisioningServiceImpl implements UserProvisioningService {
  constructor(
    private readonly users: UsersRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findByEmail(email: string): Promise<UserSummary | null> {
    const row = await this.users.findByEmail(email);
    return row ? toUserSummary(row) : null;
  }

  async findById(id: string): Promise<UserSummary | null> {
    const row = await this.users.findById(id);
    return row ? toUserSummary(row) : null;
  }

  async findByIds(ids: string[]): Promise<UserSummary[]> {
    const rows = await this.users.findByIds(ids);
    return rows.map(toUserSummary);
  }

  async createVerifiedUser(params: CreateVerifiedUserParams): Promise<UserSummary> {
    const passwordHash = await this.hasher.hash(params.password);
    const row = await this.users.create({
      organizationId: params.organizationId,
      email: params.email,
      name: params.name,
      passwordHash,
      emailVerifiedAt: this.clock.now(),
    });
    return toUserSummary(row);
  }
}
