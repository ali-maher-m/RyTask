import { Inject, Injectable } from '@nestjs/common';
import {
  type Database,
  type OneTimeToken,
  type OneTimeTokenPurpose,
  oneTimeTokens,
} from '@rytask/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export interface IssueOneTimeTokenColumns {
  organizationId: string;
  userId: string;
  purpose: OneTimeTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Single-use, time-limited tokens for email verification + password reset (data-model §3.5,
 * FR-AUTH-003, research D9). The secret is stored only as a keyed hash (SC-002).
 * `findByHash` is a documented global exception: verify/reset are public routes that run
 * before any tenant context exists, and the hash (derived from the emailed token) is the key.
 * `issue`/`consume` are org-explicit / by-PK; `listLiveForUser` is tenant-scoped (isolation).
 */
@Injectable()
export class OneTimeTokensRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Issue a one-time token (org explicit — issued before/around ALS). */
  async issue(data: IssueOneTimeTokenColumns): Promise<OneTimeToken> {
    const [row] = await this.db
      .insert(oneTimeTokens)
      .values({
        organizationId: data.organizationId,
        userId: data.userId,
        purpose: data.purpose,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      })
      .returning();
    if (!row) {
      throw new Error('failed to issue one-time token');
    }
    return row;
  }

  /** Global lookup by token hash (verify/reset run public, pre-ALS; the hash is the key). */
  async findByHash(tokenHash: string): Promise<OneTimeToken | null> {
    const [row] = await this.db
      .select()
      .from(oneTimeTokens)
      .where(eq(oneTimeTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  /**
   * Atomically claim a token (single-use). The conditional `WHERE … consumed_at IS NULL` makes
   * consumption a compare-and-set, so two concurrent confirm/verify requests with the same token
   * can't both succeed (TOCTOU): returns `true` only for the request that flipped the row.
   */
  async consume(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(oneTimeTokens)
      .set({ consumedAt: at })
      .where(and(eq(oneTimeTokens.id, id), isNull(oneTimeTokens.consumedAt)))
      .returning({ id: oneTimeTokens.id });
    return rows.length > 0;
  }

  /** Tenant-scoped list of a user's live (unconsumed, unexpired) tokens for a purpose. */
  async listLiveForUser(
    userId: string,
    purpose: OneTimeTokenPurpose,
    now: Date,
  ): Promise<OneTimeToken[]> {
    return this.db
      .select()
      .from(oneTimeTokens)
      .where(
        this.scoped(
          oneTimeTokens,
          eq(oneTimeTokens.userId, userId),
          eq(oneTimeTokens.purpose, purpose),
          isNull(oneTimeTokens.consumedAt),
          gt(oneTimeTokens.expiresAt, now),
        ),
      );
  }

  /** Invalidate any outstanding tokens of a purpose for a user (re-request supersedes). */
  async consumeAllForUser(
    organizationId: string,
    userId: string,
    purpose: OneTimeTokenPurpose,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(oneTimeTokens)
      .set({ consumedAt: at })
      .where(
        and(
          eq(oneTimeTokens.organizationId, organizationId),
          eq(oneTimeTokens.userId, userId),
          eq(oneTimeTokens.purpose, purpose),
          isNull(oneTimeTokens.consumedAt),
        ),
      );
  }
}
