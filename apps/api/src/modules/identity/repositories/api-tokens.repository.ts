import { Inject, Injectable } from '@nestjs/common';
import { type ApiToken, type Database, type TokenType, apiTokens } from '@rytask/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export interface CreateApiTokenColumns {
  organizationId: string;
  userId: string;
  type: TokenType;
  name: string;
  tokenHash: string;
  scopes: string[];
  expiresAt?: Date | null;
}

/**
 * Tenant-scoped store over `api_tokens` (data-model §3.3, FR-AUTH-007, research D5). The
 * secret is stored only as a keyed hash (SC-002). `findByHash` is the documented global
 * exception: the token verifier runs in the request middleware before any tenant context
 * exists, and the hash is the lookup key. Listing/revoking are scoped to the owning user +
 * org so a holder only ever sees/manages their own tokens.
 */
@Injectable()
export class ApiTokensRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  async create(data: CreateApiTokenColumns): Promise<ApiToken> {
    const [row] = await this.db
      .insert(apiTokens)
      .values({
        organizationId: data.organizationId,
        userId: data.userId,
        type: data.type,
        name: data.name,
        tokenHash: data.tokenHash,
        scopes: data.scopes,
        expiresAt: data.expiresAt ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to create api token');
    }
    return row;
  }

  /** Global lookup by token hash (verifier runs pre-ALS; the hash is the key). */
  async findByHash(tokenHash: string): Promise<ApiToken | null> {
    const [row] = await this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  /** A user's own active (un-revoked) tokens in the current org, oldest first. */
  async listForUser(userId: string): Promise<ApiToken[]> {
    return this.db
      .select()
      .from(apiTokens)
      .where(this.scoped(apiTokens, eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .orderBy(asc(apiTokens.createdAt));
  }

  /** Revoke one of the user's own tokens (scoped); false if not found / not theirs. */
  async revoke(id: string, userId: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(apiTokens)
      .set({ revokedAt: at })
      .where(
        this.scoped(
          apiTokens,
          eq(apiTokens.id, id),
          eq(apiTokens.userId, userId),
          isNull(apiTokens.revokedAt),
        ),
      )
      .returning({ id: apiTokens.id });
    return rows.length > 0;
  }

  /** Stamp last-used by PK (the verifier already resolved the row by its secret hash). */
  async stampLastUsed(id: string, at: Date): Promise<void> {
    await this.db.update(apiTokens).set({ lastUsedAt: at }).where(eq(apiTokens.id, id));
  }

  /** Revoke every active token for a user in an org (member removal / reset, US8). */
  async revokeAllForUser(organizationId: string, userId: string, at: Date): Promise<void> {
    await this.db
      .update(apiTokens)
      .set({ revokedAt: at })
      .where(
        and(
          eq(apiTokens.organizationId, organizationId),
          eq(apiTokens.userId, userId),
          isNull(apiTokens.revokedAt),
        ),
      );
  }
}
