import { Inject, Injectable } from '@nestjs/common';
import type { SearchResult } from '@rytask/contracts';
import { type Database, comments, labels, projects, users, workItems } from '@rytask/db';
import { type SQL, and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';
import type { SearchPlan } from '../domain/search-query';
import { hasProjectScopedReach } from '../domain/search-query';

/**
 * READ-ONLY search reads (data-model §4: the search module owns NO tables — the documented
 * exception). It queries the generated `search_vector` tsvectors on `work_items` and
 * `comments` (FTS, D8) and ILIKE-matches the small projects/labels/users sets. EVERY query
 * is tenant-scoped via `TenantScopedRepository`; project-scoped reads are additionally
 * confined to the principal's accessible projects (∪ mention-granted items) so results
 * NEVER cross orgs or leak inaccessible projects (FR-SRCH-001/004, SC-009/014).
 */
@Injectable()
export class SearchRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /**
   * Permission scope predicate for a work-item-anchored read: the item's project is
   * accessible, OR the item is mention-granted to the principal (FR-COLLAB-002). Applied to
   * both the work_items read and the comments read (which joins its parent item), so both
   * ride the same access decision. With no accessible projects and no mention-grants it
   * collapses to `false` (defense in depth — the read returns nothing).
   */
  private itemAccessScope(plan: SearchPlan): SQL {
    const parts: SQL[] = [];
    const accessible = plan.scope.accessibleProjectIds;
    if (accessible.length > 0) {
      parts.push(inArray(workItems.projectId, accessible));
    }
    if (plan.scope.mentionGrantedItemIds.length > 0) {
      parts.push(inArray(workItems.id, plan.scope.mentionGrantedItemIds));
    }
    if (parts.length === 0) {
      return sql`false` as SQL;
    }
    return (parts.length === 1 ? parts[0] : or(...parts)) as SQL;
  }

  /**
   * Work-item FTS hits (title weight A, description B). Ranked by `ts_rank_cd` over the
   * generated `search_vector` column, scoped to accessible projects (∪ mention-granted),
   * excluding trashed items. `search_vector` is a generated column not in the Drizzle
   * table object, so it is referenced by qualified name (mirrors work-items' filter DSL).
   */
  async searchWorkItems(plan: SearchPlan): Promise<SearchResult[]> {
    if (!hasProjectScopedReach(plan)) return [];
    const rows = await this.db
      .select({
        id: workItems.id,
        title: workItems.title,
        description: workItems.description,
        projectId: workItems.projectId,
        rank: sql<number>`ts_rank_cd(work_items.search_vector, websearch_to_tsquery('english', ${plan.term}))`,
      })
      .from(workItems)
      .where(
        this.scoped(
          workItems,
          isNull(workItems.deletedAt),
          sql`work_items.search_vector @@ websearch_to_tsquery('english', ${plan.term})`,
          this.itemAccessScope(plan),
        ),
      )
      .orderBy(
        sql`ts_rank_cd(work_items.search_vector, websearch_to_tsquery('english', ${plan.term})) desc`,
      )
      .limit(plan.limit);
    return rows.map((r) => ({
      type: 'work_item' as const,
      id: r.id,
      title: r.title,
      snippet: r.description ? r.description.slice(0, 200) : null,
      rank: Number(r.rank),
      projectId: r.projectId,
    }));
  }

  /**
   * Comment FTS hits (body). Ranked by `ts_rank_cd`, scoped to accessible projects via the
   * parent work item's project (joined, non-deleted item + non-deleted comment).
   */
  async searchComments(plan: SearchPlan): Promise<SearchResult[]> {
    if (!hasProjectScopedReach(plan)) return [];
    const rows = await this.db
      .select({
        id: comments.id,
        body: comments.body,
        projectId: workItems.projectId,
        workItemId: workItems.id,
        rank: sql<number>`ts_rank_cd(comments.search_vector, websearch_to_tsquery('english', ${plan.term}))`,
      })
      .from(comments)
      .innerJoin(workItems, eq(workItems.id, comments.workItemId))
      .where(
        this.scoped(
          comments,
          isNull(comments.deletedAt),
          isNull(workItems.deletedAt),
          sql`comments.search_vector @@ websearch_to_tsquery('english', ${plan.term})`,
          this.itemAccessScope(plan),
        ),
      )
      .orderBy(
        sql`ts_rank_cd(comments.search_vector, websearch_to_tsquery('english', ${plan.term})) desc`,
      )
      .limit(plan.limit);
    return rows.map((r) => ({
      type: 'comment' as const,
      id: r.id,
      title: r.body.slice(0, 80),
      snippet: r.body.slice(0, 200),
      rank: Number(r.rank),
      projectId: r.projectId,
    }));
  }

  /**
   * Project hits (name/description ILIKE), confined to accessible projects. Small set, so
   * trigram/ILIKE rather than FTS (research §Search). A constant rank keeps these below
   * FTS hits in the merged ordering.
   */
  async searchProjects(plan: SearchPlan): Promise<SearchResult[]> {
    const accessible = plan.scope.accessibleProjectIds;
    if (accessible.length === 0) return [];
    const rows = await this.db
      .select({ id: projects.id, name: projects.name, description: projects.description })
      .from(projects)
      .where(
        this.scoped(
          projects,
          inArray(projects.id, accessible),
          isNull(projects.archivedAt),
          or(
            sql`${projects.name} ilike ${plan.likePattern}`,
            sql`${projects.description} ilike ${plan.likePattern}`,
          ),
        ),
      )
      .limit(plan.limit);
    return rows.map((r) => ({
      type: 'project' as const,
      id: r.id,
      title: r.name,
      snippet: r.description ? r.description.slice(0, 200) : null,
      rank: 0,
      projectId: r.id,
    }));
  }

  /** Label hits (name ILIKE), tenant-scoped (labels are workspace-wide, not project-scoped). */
  async searchLabels(plan: SearchPlan): Promise<SearchResult[]> {
    const rows = await this.db
      .select({ id: labels.id, name: labels.name })
      .from(labels)
      .where(this.scoped(labels, sql`${labels.name} ilike ${plan.likePattern}`))
      .limit(plan.limit);
    return rows.map((r) => ({
      type: 'label' as const,
      id: r.id,
      title: r.name,
      snippet: null,
      rank: 0,
      projectId: null,
    }));
  }

  /** User hits (name/email ILIKE), tenant-scoped to the org (members directory). */
  async searchUsers(plan: SearchPlan): Promise<SearchResult[]> {
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(
        this.scoped(
          users,
          or(
            sql`${users.name} ilike ${plan.likePattern}`,
            sql`${users.email} ilike ${plan.likePattern}`,
          ),
        ),
      )
      .limit(plan.limit);
    return rows.map((r) => ({
      type: 'user' as const,
      id: r.id,
      title: r.name,
      snippet: r.email,
      rank: 0,
      projectId: null,
    }));
  }
}
