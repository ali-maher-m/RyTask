import { Inject, Injectable } from '@nestjs/common';
import { type Database, type GithubConnection, githubConnections } from '@rytask/db';
import { desc, eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type GithubConnectionRow = GithubConnection;

/** Columns written when connecting a repository (the secret arrives already encrypted). */
export interface UpsertGithubConnectionData {
  workspaceId: string;
  repoFullName: string;
  webhookSecretCiphertext: string;
  webhookSecretIv: string;
  webhookSecretTag: string;
  createdByUserId: string;
}

/**
 * Tenant-scoped store over `github_connections` (M5, FR-INT-GH-006/007). Every read/write is
 * scoped to the current org via `TenantScopedRepository`. `findById` is the documented global
 * exception (the `slack_workspaces.findByTeamId` precedent): the webhook runs before any tenant
 * context exists and resolves the URL's connection id → its owning org/workspace server-side.
 */
@Injectable()
export class GithubConnectionsRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /**
   * Insert or re-key the connection for a repository (idempotent reconnect). Reconnecting the
   * same `owner/repo` mints a NEW secret on the existing row and clears `revoked_at` — the old
   * secret stops verifying immediately (rotate-on-reconnect).
   */
  async upsert(data: UpsertGithubConnectionData): Promise<GithubConnectionRow> {
    const orgId = this.tenant.getOrgId();
    const [row] = await this.db
      .insert(githubConnections)
      .values({
        organizationId: orgId,
        workspaceId: data.workspaceId,
        repoFullName: data.repoFullName,
        webhookSecretCiphertext: data.webhookSecretCiphertext,
        webhookSecretIv: data.webhookSecretIv,
        webhookSecretTag: data.webhookSecretTag,
        createdByUserId: data.createdByUserId,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: [githubConnections.organizationId, githubConnections.repoFullName],
        set: {
          workspaceId: data.workspaceId,
          webhookSecretCiphertext: data.webhookSecretCiphertext,
          webhookSecretIv: data.webhookSecretIv,
          webhookSecretTag: data.webhookSecretTag,
          createdByUserId: data.createdByUserId,
          revokedAt: null,
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error('failed to upsert github connection');
    }
    return row;
  }

  /** All of the current org's connections, newest first (revoked rows included — visible state). */
  async listForOrg(): Promise<GithubConnectionRow[]> {
    return this.db
      .select()
      .from(githubConnections)
      .where(this.orgScope(githubConnections))
      .orderBy(desc(githubConnections.connectedAt));
  }

  /**
   * GLOBAL lookup by id — the webhook resolver (documented exception, the `findByTeamId`
   * precedent). The caller re-establishes tenant context from the returned row, never from
   * the payload.
   */
  async findById(id: string): Promise<GithubConnectionRow | null> {
    const [row] = await this.db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Soft-revoke one of the current org's connections; true when a row was revoked. */
  async revoke(id: string): Promise<boolean> {
    const rows = await this.db
      .update(githubConnections)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(this.scoped(githubConnections, eq(githubConnections.id, id)))
      .returning({ id: githubConnections.id });
    return rows.length > 0;
  }
}
