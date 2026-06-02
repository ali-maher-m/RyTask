import { Inject, Injectable } from '@nestjs/common';
import { type Database, type Invitation, type RoleType, invitations } from '@rytask/db';
import { asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export interface CreateInvitationColumns {
  organizationId: string;
  email: string | null;
  role: RoleType;
  workspaceId?: string | null;
  tokenHash: string;
  invitedByUserId: string | null;
  expiresAt: Date;
}

/**
 * Tenant-scoped store over `invitations` (data-model §3, FR-AUTH-011). The token secret is
 * stored only as a keyed hash (SC-002). `findByTokenHash` is a documented global exception:
 * preview/accept are public routes that run before any tenant context exists, and the hash —
 * derived from the bearer token — is the access key (mirrors `sessions.findByRefreshHash`).
 * All other reads/writes are org-scoped so one org can never list or revoke another's invites.
 */
@Injectable()
export class InvitationsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert an invite (org explicit — created in an authenticated admin context). */
  async create(data: CreateInvitationColumns): Promise<Invitation> {
    const [row] = await this.db
      .insert(invitations)
      .values({
        organizationId: data.organizationId,
        email: data.email,
        role: data.role,
        workspaceId: data.workspaceId ?? null,
        tokenHash: data.tokenHash,
        invitedByUserId: data.invitedByUserId,
        expiresAt: data.expiresAt,
      })
      .returning();
    if (!row) {
      throw new Error('failed to create invitation');
    }
    return row;
  }

  /** Global lookup by token hash (preview/accept run public, pre-ALS; the hash is the key). */
  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  /** Pending (live) invites for the current org, oldest first. */
  async listPending(now: Date): Promise<Invitation[]> {
    return this.db
      .select()
      .from(invitations)
      .where(
        this.scoped(
          invitations,
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(asc(invitations.createdAt));
  }

  /** A live email invite for an address in the current org (case-insensitive), or null. */
  async findLiveByEmail(email: string, now: Date): Promise<Invitation | null> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(
        this.scoped(
          invitations,
          eq(sql`lower(${invitations.email})`, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Mark an invite accepted by PK (post-validation; the secret token already proved access). */
  async markAccepted(id: string, at: Date): Promise<void> {
    await this.db.update(invitations).set({ acceptedAt: at }).where(eq(invitations.id, id));
  }

  /** Revoke a still-pending invite in the current org; false if none matched (→ 404). */
  async revoke(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(invitations)
      .set({ revokedAt: at })
      .where(
        this.scoped(
          invitations,
          eq(invitations.id, id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .returning({ id: invitations.id });
    return rows.length > 0;
  }
}
