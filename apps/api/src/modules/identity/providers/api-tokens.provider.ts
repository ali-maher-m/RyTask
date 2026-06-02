import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ApiTokenDto, ApiTokenSecret, CreateApiToken } from '@rytask/contracts';
import type { Principal } from '../../../common/auth/principal';
import { TokenHasher } from '../../../common/auth/token-hasher';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TokenIssuedEvent } from '../events/auth.events';
import { ApiTokensRepository } from '../repositories/api-tokens.repository';
import { toApiTokenDto } from './api-token.mapper';

/** Secret prefixes by token type (the verifier routes on these — token-verifier.service). */
const PREFIX_BY_TYPE: Record<CreateApiToken['type'], string> = {
  PAT: 'rytask_pat_',
  MCP: 'rytask_mcp_',
};

/**
 * Personal Access Token management (US7, FR-AUTH-007, research D5). Mint a scoped token whose
 * secret is `rytask_pat_<random>` (or `rytask_mcp_`), **returned once** and stored only as a
 * keyed hash (SC-002). List/revoke are scoped to the holder. Effective permission at call
 * time = scope ∩ role, enforced by the RbacGuard via the verified principal's scopes.
 */
@Injectable()
export class ApiTokensProvider {
  constructor(
    private readonly tokens: ApiTokensRepository,
    private readonly tokenHasher: TokenHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
  ) {}

  /** Mint a token; the plaintext `secret` is in the response and never persisted. */
  async issue(principal: Principal, input: CreateApiToken): Promise<ApiTokenSecret> {
    const secret = this.tokenHasher.generate(PREFIX_BY_TYPE[input.type]);
    const row = await this.tokens.create({
      organizationId: principal.organizationId,
      userId: principal.userId,
      type: input.type,
      name: input.name,
      tokenHash: this.tokenHasher.hash(secret),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    this.events.emit(
      TokenIssuedEvent.eventName,
      new TokenIssuedEvent(row.organizationId, row.userId, row.id, row.type),
    );
    return { ...toApiTokenDto(row), secret };
  }

  /** The holder's own active tokens (never the secret). */
  async list(principal: Principal): Promise<ApiTokenDto[]> {
    const rows = await this.tokens.listForUser(principal.userId);
    return rows.map(toApiTokenDto);
  }

  /** Revoke one of the holder's own tokens (404 if not found / not theirs). */
  async revoke(principal: Principal, id: string): Promise<void> {
    const ok = await this.tokens.revoke(id, principal.userId, this.clock.now());
    if (!ok) {
      throw new NotFoundException('token not found');
    }
  }
}
