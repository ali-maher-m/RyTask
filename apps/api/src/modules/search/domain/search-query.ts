import type { SearchResultType } from '@rytask/contracts';
import { searchResultTypes } from '@rytask/contracts';

/**
 * Pure builder of the permission-aware search query *shape* (US8, T118). No `@rytask/db`
 * dependency: it resolves which result kinds to query, normalizes the term, and — most
 * importantly — encodes the access decision so the repository's reads can never cross
 * tenants or leak inaccessible projects (FR-SRCH-001/004, SC-009/014). The repository
 * turns this plan into the actual Postgres FTS (`websearch_to_tsquery` + `ts_rank_cd`)
 * and ILIKE reads, every one tenant-scoped and intersected with `accessibleProjectIds`.
 */

/** The accessible-project intersection: which work_item/comment hits the principal may see. */
export interface AccessScope {
  /** Project ids the principal can read (from PROJECT_ACCESS.accessibleProjectIds). */
  accessibleProjectIds: string[];
  /** Work-item ids the principal may also see via a MENTIONED watcher (FR-COLLAB-002). */
  mentionGrantedItemIds: string[];
}

/** A fully-resolved search plan: what to match, which kinds, and the access scope. */
export interface SearchPlan {
  /** The raw user term, trimmed (passed verbatim to `websearch_to_tsquery` / ILIKE). */
  term: string;
  /** An ILIKE pattern (`%term%`) for the small-set project/label/user lookups. */
  likePattern: string;
  /** Which result kinds to include (defaulted to all, filtered by `?types=`). */
  kinds: ReadonlySet<SearchResultType>;
  /** Per-page cap (already validated by the DTO). */
  limit: number;
  scope: AccessScope;
}

/** Escape `%` / `_` / `\` so the user term is a literal in an ILIKE pattern (no wildcards). */
export function escapeLike(term: string): string {
  return term.replace(/([\\%_])/g, '\\$1');
}

/** Parse the optional `?types=a,b` list into the validated kind set (empty/invalid → all). */
export function resolveKinds(types: string | undefined): ReadonlySet<SearchResultType> {
  if (!types) return new Set(searchResultTypes);
  const requested = types
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is SearchResultType => (searchResultTypes as readonly string[]).includes(t));
  return requested.length > 0 ? new Set(requested) : new Set(searchResultTypes);
}

/**
 * Build the permission-aware plan. The work_item/comment reads are confined to
 * `accessibleProjectIds` (∪ the mention-granted items); when the principal can reach no
 * projects and was mentioned on nothing, those reads are statically pruned to the empty
 * set so they cannot return rows.
 */
export function buildSearchPlan(args: {
  term: string;
  types: string | undefined;
  limit: number;
  scope: AccessScope;
}): SearchPlan {
  const term = args.term.trim();
  return {
    term,
    likePattern: `%${escapeLike(term)}%`,
    kinds: resolveKinds(args.types),
    limit: args.limit,
    scope: {
      accessibleProjectIds: [...new Set(args.scope.accessibleProjectIds)],
      mentionGrantedItemIds: [...new Set(args.scope.mentionGrantedItemIds)],
    },
  };
}

/** True if the plan can match any project-scoped row (work_item / comment). */
export function hasProjectScopedReach(plan: SearchPlan): boolean {
  return plan.scope.accessibleProjectIds.length > 0 || plan.scope.mentionGrantedItemIds.length > 0;
}
