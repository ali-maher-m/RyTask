'use client';

import { ApiError, authedRequest } from '@/lib/api';
import type {
  Project,
  ProjectListResponse,
  WorkItem,
  WorkItemListResponse,
} from '@rytask/contracts';

/**
 * Browser API client for the cross-project "My Work" page (US4, T075, FR-PROJ-006). The
 * hand-written `@rytask/sdk` only covers health today, so this calls `/api/v1` with `fetch`.
 * Every call carries the M0 bearer token and silently refreshes on a 401 (`authedRequest`) — the
 * M1 dev-header seam (`x-user-id` …) is gone. List envelopes follow openapi.yaml:
 * `{ data, pageInfo }` with keyset cursor pagination.
 */

// Re-exported so consumers' `instanceof ApiError` checks share one identity with `lib/api`.
export { ApiError };

const request = authedRequest;

/** One page of the "My Work" smart view (`smart=my-work` → assignee=me, cross-project). */
export interface MyWorkPage {
  items: WorkItem[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Read one keyset page of the current user's assigned items across every accessible project
 * (`GET /work-items?smart=my-work`). The page is cursor-paginated; `cursor` advances it.
 */
export async function listMyWork(cursor?: string | null, limit = 50): Promise<MyWorkPage> {
  const params = new URLSearchParams({ smart: 'my-work', limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const page = await request<WorkItemListResponse>(`/work-items?${params.toString()}`);
  return {
    items: page.data,
    nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null,
    hasNextPage: page.pageInfo.hasNextPage,
  };
}

/**
 * List the accessible projects (walks every keyset page; M1 orgs are small) so "My Work" can
 * label each cross-project item with its project name + key prefix.
 */
export async function listAllProjects(): Promise<Project[]> {
  const all: Project[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page: ProjectListResponse = await request<ProjectListResponse>(
      `/projects?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}
