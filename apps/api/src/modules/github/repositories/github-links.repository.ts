import { Inject, Injectable } from '@nestjs/common';
import { type Database, type GithubLink, type GithubLinkKind, githubLinks } from '@rytask/db';
import { eq } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

export type GithubLinkRow = GithubLink;

/** One commit/PR ↔ item link to persist (M5, FR-INT-GH-006). */
export interface InsertGithubLinkData {
  workItemId: string;
  connectionId: string;
  kind: GithubLinkKind;
  externalRef: string;
  url: string;
  title: string | null;
  authorLogin: string | null;
}

/**
 * Tenant-scoped store over `github_links` (M5). The unique index
 * `(org, work_item, kind, external_ref)` IS the redelivery idempotency (FR-INT-GH-007):
 * `insertIfAbsent` reports whether a row was actually created, and ONLY a real insert appends
 * activity — a webhook replay writes nothing twice.
 */
@Injectable()
export class GithubLinksRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Insert unless the same item↔ref link already exists; true only when a row was created. */
  async insertIfAbsent(data: InsertGithubLinkData): Promise<boolean> {
    const rows = await this.db
      .insert(githubLinks)
      .values({
        organizationId: this.tenant.getOrgId(),
        workItemId: data.workItemId,
        connectionId: data.connectionId,
        kind: data.kind,
        externalRef: data.externalRef,
        url: data.url,
        title: data.title,
        authorLogin: data.authorLogin,
      })
      .onConflictDoNothing()
      .returning({ id: githubLinks.id });
    return rows.length > 0;
  }

  /** All links for one item (tenant-scoped), oldest first. */
  async listForItem(workItemId: string): Promise<GithubLinkRow[]> {
    return this.db
      .select()
      .from(githubLinks)
      .where(this.scoped(githubLinks, eq(githubLinks.workItemId, workItemId)))
      .orderBy(githubLinks.createdAt);
  }
}
