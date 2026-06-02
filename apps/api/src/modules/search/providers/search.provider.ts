import { Inject, Injectable } from '@nestjs/common';
import type { SearchQuery, SearchResult } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { buildSearchPlan } from '../domain/search-query';
import { SearchRepository } from '../repositories/search.repository';

/**
 * Permission-aware search read path (US8, FR-SRCH-001/004). Resolves the principal's
 * access scope (accessible projects from PROJECT_ACCESS, ∪ items they were mentioned on),
 * builds the pure query plan (domain/search-query), runs the per-kind reads through the
 * read-only repository, then merges + ranks them into one flat list. Every read is tenant-
 * scoped AND intersected with the access scope, so results never cross orgs or leak
 * inaccessible projects (SC-009/014).
 */
@Injectable()
export class SearchProvider {
  constructor(
    private readonly repo: SearchRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
    @Inject(WORK_ITEM_ACCESS) private readonly workItemAccess: WorkItemAccessService,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const principalId = this.tenant.getUserId() ?? '';
    const [accessibleProjectIds, mentionGrantedItemIds] = await Promise.all([
      this.access.accessibleProjectIds(),
      // Mention-grant scope comes through the work-items contract — search never reads
      // `work_item_watchers` (owned by work-items) directly (Principle III).
      principalId ? this.workItemAccess.mentionGrantedItemIds(principalId) : Promise.resolve([]),
    ]);

    const plan = buildSearchPlan({
      term: query.q,
      types: query.types,
      limit: query.limit,
      scope: { accessibleProjectIds, mentionGrantedItemIds },
    });

    // Run only the kinds the client asked for (default: all). Each read is independent.
    const reads: Array<Promise<SearchResult[]>> = [];
    if (plan.kinds.has('work_item')) reads.push(this.repo.searchWorkItems(plan));
    if (plan.kinds.has('comment')) reads.push(this.repo.searchComments(plan));
    if (plan.kinds.has('project')) reads.push(this.repo.searchProjects(plan));
    if (plan.kinds.has('label')) reads.push(this.repo.searchLabels(plan));
    if (plan.kinds.has('user')) reads.push(this.repo.searchUsers(plan));

    const grouped = await Promise.all(reads);
    const merged = grouped.flat();

    // Rank desc; FTS hits (ts_rank_cd > 0) float above the constant-ranked ILIKE hits. Ties
    // break by type for a stable order, then trim to the requested page size.
    merged.sort((a, b) => b.rank - a.rank || a.type.localeCompare(b.type));
    return merged.slice(0, plan.limit);
  }
}
