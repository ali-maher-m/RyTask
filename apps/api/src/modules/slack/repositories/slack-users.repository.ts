import { Inject, Injectable } from '@nestjs/common';
import { type Database, type SlackUser, slackUsers } from '@rytask/db';
import { type SQL, asc, eq, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type SlackUserRow = SlackUser;

/** A Slack user discovered on connect (auto-mapped by email when a RyTask match exists). */
export interface UpsertSlackUserData {
  slackWorkspaceId: string;
  slackUserId: string;
  slackUserName?: string | null;
  slackUserEmail?: string | null;
  /** Resolved RyTask user (email match), or null when unmapped. */
  userId?: string | null;
}

/**
 * Tenant-scoped store over `slack_users` (M3, data-model §1.2, FR-X-001). One mapping row per
 * Slack user per connection (unique on org + workspace + slack_user_id). Auto-map on connect is
 * idempotent (upsert); manual link/unlink (US5) flips `mapped_manually` + `user_id`.
 */
@Injectable()
export class SlackUsersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /**
   * Idempotently upsert the discovered Slack users for a connection (auto-map by email on connect,
   * FR-SLK-002). On conflict it refreshes name/email and the auto-resolved `user_id` — but NEVER
   * clobbers a manual mapping (`mapped_manually = true` rows keep their link). Tenant-scoped.
   */
  async upsertMany(rows: UpsertSlackUserData[]): Promise<void> {
    if (rows.length === 0) return;
    const orgId = this.tenant.getOrgId();
    await this.db
      .insert(slackUsers)
      .values(
        rows.map((r) => ({
          organizationId: orgId,
          slackWorkspaceId: r.slackWorkspaceId,
          slackUserId: r.slackUserId,
          slackUserName: r.slackUserName ?? null,
          slackUserEmail: r.slackUserEmail ?? null,
          userId: r.userId ?? null,
          mappedManually: false,
        })),
      )
      .onConflictDoUpdate({
        target: [slackUsers.organizationId, slackUsers.slackWorkspaceId, slackUsers.slackUserId],
        set: {
          slackUserName: sqlExcluded('slack_user_name'),
          slackUserEmail: sqlExcluded('slack_user_email'),
          // Only re-apply an auto match when the row isn't a manual mapping (preserve US5 edits).
          userId: sqlAutoUserId(),
          updatedAt: new Date(),
        },
      });
  }

  /** All mapping rows for a connection (mapped + unmapped), tenant-scoped, stable order. */
  async listForWorkspace(slackWorkspaceId: string): Promise<SlackUserRow[]> {
    return this.db
      .select()
      .from(slackUsers)
      .where(this.scoped(slackUsers, eq(slackUsers.slackWorkspaceId, slackWorkspaceId)))
      .orderBy(asc(slackUsers.slackUserName), asc(slackUsers.slackUserId));
  }

  /** A single mapping row by Slack user id within a connection, tenant-scoped. */
  async findBySlackUserId(
    slackWorkspaceId: string,
    slackUserId: string,
  ): Promise<SlackUserRow | null> {
    const [row] = await this.db
      .select()
      .from(slackUsers)
      .where(
        this.scoped(
          slackUsers,
          eq(slackUsers.slackWorkspaceId, slackWorkspaceId),
          eq(slackUsers.slackUserId, slackUserId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Manually link a Slack user to a RyTask user (`mapped_manually = true`), tenant-scoped. */
  async setMapping(
    slackWorkspaceId: string,
    slackUserId: string,
    userId: string,
  ): Promise<SlackUserRow | null> {
    const [row] = await this.db
      .update(slackUsers)
      .set({ userId, mappedManually: true, updatedAt: new Date() })
      .where(
        this.scoped(
          slackUsers,
          eq(slackUsers.slackWorkspaceId, slackWorkspaceId),
          eq(slackUsers.slackUserId, slackUserId),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Unlink a Slack user (clears `user_id`, `mapped_manually = false`), tenant-scoped. */
  async clearMapping(slackWorkspaceId: string, slackUserId: string): Promise<SlackUserRow | null> {
    const [row] = await this.db
      .update(slackUsers)
      .set({ userId: null, mappedManually: false, updatedAt: new Date() })
      .where(
        this.scoped(
          slackUsers,
          eq(slackUsers.slackWorkspaceId, slackWorkspaceId),
          eq(slackUsers.slackUserId, slackUserId),
        ),
      )
      .returning();
    return row ?? null;
  }
}

// Local helpers for the upsert `set` clause — reference the proposed (EXCLUDED) row + guard a
// manual mapping. Kept here (not in the shared repo base) since they are Slack-upsert-specific.
function sqlExcluded(column: string): SQL {
  return sql.raw(`excluded.${column}`);
}

/** Keep a manual mapping; otherwise take the freshly auto-resolved user id. */
function sqlAutoUserId(): SQL {
  return sql`case when ${slackUsers.mappedManually} then ${slackUsers.userId} else excluded.user_id end`;
}
