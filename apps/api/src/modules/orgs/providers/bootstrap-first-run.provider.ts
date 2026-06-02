import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthResult, BootstrapRequest } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../common/ports/password-hasher.port';
import { SESSION_ISSUER, type SessionIssuer } from '../../identity/identity.contract';
import { firstRunAvailable, orgSlug, starterKeyPrefix } from '../domain/bootstrap.policy';
import { OrganizationCreatedEvent } from '../events/organization-created.event';
import {
  AlreadyBootstrappedError,
  BootstrapRepository,
} from '../repositories/bootstrap.repository';

/**
 * First-run onboarding provider (US1, FR-AUTH-010, research D7). Atomically creates the
 * org + owner + OWNER membership + default workspace + starter project (six categorized
 * statuses), emits `organization.created`, and signs the owner in (SESSION_ISSUER). Reachable
 * only while zero orgs exist; once bootstrapped, re-runs return 409 (`/setup` self-closes).
 */
@Injectable()
export class BootstrapFirstRunProvider {
  constructor(
    private readonly repo: BootstrapRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SESSION_ISSUER) private readonly sessions: SessionIssuer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  /** Is first-run still available (no org yet)? Powers `GET /setup`. */
  async isAvailable(): Promise<boolean> {
    return firstRunAvailable(await this.repo.countOrgs());
  }

  /** Bootstrap the instance and return the owner's authenticated session. */
  async bootstrap(input: BootstrapRequest): Promise<AuthResult> {
    if (!(await this.isAvailable())) {
      throw new ConflictException('already bootstrapped');
    }

    const passwordHash = await this.hasher.hash(input.ownerPassword);
    let created: Awaited<ReturnType<BootstrapRepository['bootstrap']>>;
    try {
      created = await this.repo.bootstrap({
        organizationName: input.organizationName,
        orgSlug: orgSlug(input.organizationName),
        settings: { allowPublicSignup: false },
        ownerName: input.ownerName,
        ownerEmail: input.ownerEmail,
        ownerPasswordHash: passwordHash,
        starterProjectName: 'Getting Started',
        starterKeyPrefix: starterKeyPrefix(input.organizationName),
        now: this.clock.now(),
      });
    } catch (err) {
      // Lost the first-run race to a concurrent setup — same 409 as the fast-path check.
      if (err instanceof AlreadyBootstrappedError) {
        throw new ConflictException('already bootstrapped');
      }
      throw err;
    }

    this.events.emit(
      OrganizationCreatedEvent.eventName,
      new OrganizationCreatedEvent(created.org.id, created.user.id, created.workspace.id),
    );

    return this.sessions.issueSession({
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        emailVerified: created.user.emailVerifiedAt !== null,
      },
      organizationId: created.org.id,
      role: 'OWNER',
      isOrgAdmin: true,
      workspaceId: created.workspace.id,
    });
  }
}
