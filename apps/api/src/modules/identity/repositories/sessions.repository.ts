import { Inject, Injectable } from '@nestjs/common';
import { type Database, type Session, sessions } from '@rytask/db';
import { and, eq, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export interface CreateSessionColumns {
  organizationId: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Refresh-session store (data-model §3.2, FR-AUTH-002). Refresh tokens are opaque and
 * stored only as a hash (SC-002). `findByRefreshHash` is global (the refresh path runs
 * before ALS; the hash is the secret-derived key). Tenant-scoped reads/writes
 * (`listActiveForUser`, `revokeAllForUser`) take an explicit org for cross-tenant safety
 * (FR-TEST-007). Rotation revokes the prior token; reuse of a rotated token → family revoke.
 */
@Injectable()
export class SessionsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  async create(data: CreateSessionColumns): Promise<Session> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        organizationId: data.organizationId,
        userId: data.userId,
        familyId: data.familyId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent ?? null,
        ip: data.ip ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('failed to create session');
    }
    return row;
  }

  /** Global lookup by refresh-token hash (refresh runs pre-context; hash is the key). */
  async findByRefreshHash(refreshTokenHash: string): Promise<Session | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, refreshTokenHash))
      .limit(1);
    return row ?? null;
  }

  async markUsed(id: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ lastUsedAt: at }).where(eq(sessions.id, id));
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: at }).where(eq(sessions.id, id));
  }

  /** Revoke an entire rotation family (theft / logout-all). */
  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  /** Revoke every active session for a user in an org (member removal, US8). */
  async revokeAllForUser(organizationId: string, userId: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(sessions.organizationId, organizationId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
        ),
      );
  }

  /** Tenant-scoped list of a user's active sessions (uses ALS org — for isolation tests). */
  async listActiveForUser(userId: string): Promise<Session[]> {
    return this.db
      .select()
      .from(sessions)
      .where(this.scoped(sessions, eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
