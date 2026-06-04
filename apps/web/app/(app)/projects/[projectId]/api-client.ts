'use client';

import type {
  CreateWorkItem,
  MoveWorkItem,
  SaveView,
  Status,
  StatusListResponse,
  UpdateWorkItem,
  View,
  ViewListResponse,
  WorkItem,
  WorkItemListResponse,
} from '@rytask/contracts';
import { ApiError, authedRequest } from '../../../lib/api';

/**
 * Thin browser API client for the US3 Board + List pages. The hand-written `@rytask/sdk`
 * only covers health today, so these pages call `/api/v1` with `fetch`. Every call carries the
 * M0 bearer token and silently refreshes on a 401 (`authedRequest`) — the M1 dev-header seam
 * (`x-user-id` …) is gone (apps/api authenticates the `Authorization` header only). Envelopes
 * follow openapi.yaml: single resources return `{ statusCode, message, data }`; list routes
 * return `{ data, pageInfo }`.
 */

/** A single resource envelope: `{ statusCode, message, data }`. */
interface ResourceEnvelope<T> {
  data: T;
}

// Re-exported so consumers' `instanceof ApiError` checks share one identity with `lib/api`.
export { ApiError };

const request = authedRequest;

/** List the project's statuses (board columns, ordered left→right). */
export async function listStatuses(projectId: string): Promise<Status[]> {
  const body = await request<StatusListResponse>(`/projects/${projectId}/statuses`);
  return body.data;
}

/**
 * The query a `FilterBar` produces (US5, T088). A smart view OR a base64-encoded filter AST,
 * plus optional multi-key `sort` and `group`. When `smart` is set the server resolves the
 * code-defined live view and ignores `filter`; otherwise `filter` carries the compound AST.
 * `projectId` is set by the page (omit only for cross-project My Work). All fields optional so
 * the Board/List can pass `undefined` to fall back to their existing default read.
 */
export interface WorkItemQuery {
  projectId?: string;
  filter?: string;
  smart?: string;
  group?: string;
  sort?: string;
}

/**
 * List work items for a project (or, via {@link WorkItemQuery}, a filtered / smart-view set).
 * Cursor-paginated; this walks every page so the Board and List render the full set (M1
 * projects are small) without OFFSET (SC-011). A bare `(projectId, sort)` call is still
 * supported for the existing default reads; pass a `WorkItemQuery` to apply a FilterBar query.
 */
export async function listAllWorkItems(
  projectId: string,
  sortOrQuery?: string | WorkItemQuery,
): Promise<WorkItem[]> {
  const query: WorkItemQuery =
    typeof sortOrQuery === 'string'
      ? { projectId, sort: sortOrQuery }
      : { projectId, ...sortOrQuery };
  const all: WorkItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    // A smart view is cross-project by design (My Work); otherwise scope to the project.
    if (query.projectId && !query.smart) params.set('projectId', query.projectId);
    if (query.filter && !query.smart) params.set('filter', query.filter);
    if (query.smart) params.set('smart', query.smart);
    if (query.group) params.set('group', query.group);
    if (query.sort) params.set('sort', query.sort);
    if (cursor) params.set('cursor', cursor);
    const page: WorkItemListResponse = await request<WorkItemListResponse>(
      `/work-items?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** List saved views (personal + shared) for a project (FR-VIEW-008). */
export async function listViews(projectId: string): Promise<View[]> {
  const params = new URLSearchParams({ projectId });
  const body = await request<ViewListResponse>(`/views?${params.toString()}`);
  return body.data;
}

/** Save a view (filter AST + sort + grouping). Returns the created view (FR-VIEW-008). */
export async function saveView(input: SaveView): Promise<View> {
  const body = await request<ResourceEnvelope<View>>('/views', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** Create a work item (title-only or quick-add line). Returns the created item. */
export async function createWorkItem(input: CreateWorkItem): Promise<WorkItem> {
  const body = await request<ResourceEnvelope<WorkItem>>('/work-items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** Patch a work item's fields (optimistic `version`). Returns the updated item. */
export async function updateWorkItem(id: string, input: UpdateWorkItem): Promise<WorkItem> {
  const body = await request<ResourceEnvelope<WorkItem>>(`/work-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** Move a work item on the board (status column and/or fractional position). */
export async function moveWorkItem(id: string, input: MoveWorkItem): Promise<WorkItem> {
  const body = await request<ResourceEnvelope<WorkItem>>(`/work-items/${id}/move`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}
