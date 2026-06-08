import { Inject, Injectable } from '@nestjs/common';
import { type Database, type SlackWorkspace, slackWorkspaces } from '@rytask/db';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type SlackWorkspaceRow = SlackWorkspace;

/** Columns written when persisting a Slack install (the bot token is already encrypted). */
export interface UpsertSlackWorkspaceData {
  workspaceId: string;
  slackTeamId: string;
  slackTeamName: string;
  botUserId: string;
  botTokenCiphertext: string;
  botTokenIv: string;
  botTokenTag: string;
  scopes: string[];
  installedByUserId: string;
  defaultProjectId?: string | null;
}

/**
 * Tenant-scoped store over `slack_workspaces` (M3, data-model §1.1, FR-X-001). Every read/write
 * is scoped to the current org via `TenantScopedRepository`. `findByTeamId` is the documented
 * global exception (mirrors `api_tokens.findByHash`): the Slack webhook runs before any tenant
 * context exists and must resolve a verified `team_id` → its owning org/workspace server-side.
 */
@Injectable()
export class SlackWorkspacesRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /**
   * Insert or reactivate the connection for a Slack team (idempotent reconnect — research/US1).
   * `slack_team_id` is globally unique, so a re-install updates the existing row (latest install
   * wins) and clears `revoked_at`. Runs under the connecting admin's org context.
   */
  async upsert(data: UpsertSlackWorkspaceData): Promise<SlackWorkspaceRow> {
    const orgId = this.tenant.getOrgId();
    const [row] = await this.db
      .insert(slackWorkspaces)
      .values({
        organizationId: orgId,
        workspaceId: data.workspaceId,
        slackTeamId: data.slackTeamId,
        slackTeamName: data.slackTeamName,
        botUserId: data.botUserId,
        botTokenCiphertext: data.botTokenCiphertext,
        botTokenIv: data.botTokenIv,
        botTokenTag: data.botTokenTag,
        scopes: data.scopes,
        installedByUserId: data.installedByUserId,
        defaultProjectId: data.defaultProjectId ?? null,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: slackWorkspaces.slackTeamId,
        set: {
          organizationId: orgId,
          workspaceId: data.workspaceId,
          slackTeamName: data.slackTeamName,
          botUserId: data.botUserId,
          botTokenCiphertext: data.botTokenCiphertext,
          botTokenIv: data.botTokenIv,
          botTokenTag: data.botTokenTag,
          scopes: data.scopes,
          installedByUserId: data.installedByUserId,
          revokedAt: null,
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error('failed to upsert slack workspace');
    }
    return row;
  }

  /** The current org's connection (most recent by `connected_at`), or null. */
  async findForOrg(): Promise<SlackWorkspaceRow | null> {
    const [row] = await this.db
      .select()
      .from(slackWorkspaces)
      .where(this.orgScope(slackWorkspaces))
      .orderBy(desc(slackWorkspaces.connectedAt))
      .limit(1);
    return row ?? null;
  }

  /** A connection by id, tenant-scoped (used by settings update / disconnect / tests). */
  async findById(id: string): Promise<SlackWorkspaceRow | null> {
    const [row] = await this.db
      .select()
      .from(slackWorkspaces)
      .where(this.scoped(slackWorkspaces, eq(slackWorkspaces.id, id)))
      .limit(1);
    return row ?? null;
  }

  /**
   * GLOBAL (unscoped) lookup by Slack team id — the documented exception (data-model §1.1): the
   * webhook resolves a signature-verified `team_id` → this row → org/workspace before any tenant
   * context exists. `slack_team_id` is globally unique, so this returns at most one row.
   */
  async findByTeamId(slackTeamId: string): Promise<SlackWorkspaceRow | null> {
    const [row] = await this.db
      .select()
      .from(slackWorkspaces)
      .where(eq(slackWorkspaces.slackTeamId, slackTeamId))
      .limit(1);
    return row ?? null;
  }

  /** Disconnect: soft-revoke (sets `revoked_at`), tenant-scoped. Returns false if not found. */
  async setRevoked(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(slackWorkspaces)
      .set({ revokedAt: at, updatedAt: new Date() })
      .where(this.scoped(slackWorkspaces, eq(slackWorkspaces.id, id)))
      .returning({ id: slackWorkspaces.id });
    return rows.length > 0;
  }

  /** Update mutable connection settings (the slash capture-routing default project), tenant-scoped. */
  async updateSettings(
    id: string,
    settings: { defaultProjectId?: string | null },
  ): Promise<SlackWorkspaceRow | null> {
    const [row] = await this.db
      .update(slackWorkspaces)
      .set({ ...settings, updatedAt: new Date() })
      .where(this.scoped(slackWorkspaces, eq(slackWorkspaces.id, id)))
      .returning();
    return row ?? null;
  }
}
