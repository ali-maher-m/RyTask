'use client';

import type {
  ActivityEntry,
  AddSubtask,
  CreateWorkItem,
  CreateWorkItemResponse,
  MoveWorkItem,
  UpdateWorkItem,
  WorkItem,
  WorkItemListResponse,
} from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Work-items resource module (D8). The core M1 entity: create, read, update, move, hierarchy. */

/**
 * The query a FilterBar / view produces (D14). A `smart` view OR a base64-encoded filter AST,
 * plus optional multi-key `sort` and `group`. When `smart` is set the server resolves the
 * code-defined live view and ignores `filter`. `projectId` is omitted only for cross-project
 * surfaces (My Work).
 */
export interface WorkItemQuery {
  projectId?: string;
  filter?: string;
  smart?: string;
  group?: string;
  sort?: string;
}

/** GET /work-items — walk every keyset page so a surface renders the full filtered set. */
export async function listAllWorkItems(query: WorkItemQuery = {}): Promise<WorkItem[]> {
  const all: WorkItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (query.projectId && !query.smart) params.set('projectId', query.projectId);
    if (query.filter && !query.smart) params.set('filter', query.filter);
    if (query.smart) params.set('smart', query.smart);
    if (query.group) params.set('group', query.group);
    if (query.sort) params.set('sort', query.sort);
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<WorkItemListResponse>(`/work-items?${params.toString()}`);
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** GET /work-items/{id} — one item by id. */
export async function getWorkItem(id: string): Promise<WorkItem> {
  const body = await authedRequest<ResourceEnvelope<WorkItem>>(`/work-items/${id}`);
  return body.data;
}

/**
 * POST /work-items — create from a title or a quick-add line. Returns the full create response
 * envelope `{ data, meta: { unresolved } }` so the caller can surface unresolved tokens inline
 * (the server is the parser of record — D13).
 */
export function createWorkItem(input: CreateWorkItem): Promise<CreateWorkItemResponse> {
  return authedRequest<CreateWorkItemResponse>('/work-items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PATCH /work-items/{id} — partial field update with optimistic `version` (409 on stale). */
export async function updateWorkItem(id: string, input: UpdateWorkItem): Promise<WorkItem> {
  const body = await authedRequest<ResourceEnvelope<WorkItem>>(`/work-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** POST /work-items/{id}/move — board drag (status column and/or fractional position). */
export async function moveWorkItem(id: string, input: MoveWorkItem): Promise<WorkItem> {
  const body = await authedRequest<ResourceEnvelope<WorkItem>>(`/work-items/${id}/move`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** GET /work-items/{id}/activity — the immutable per-item activity feed (field, old→new, actor). */
export async function listActivity(id: string): Promise<ActivityEntry[]> {
  const body = await authedRequest<ResourceEnvelope<ActivityEntry[]>>(`/work-items/${id}/activity`);
  return body.data;
}

/** GET /work-items/{id}/subtasks — direct children (counts come back on each item). */
export async function listSubtasks(id: string): Promise<WorkItem[]> {
  const body = await authedRequest<ResourceEnvelope<WorkItem[]>>(`/work-items/${id}/subtasks`);
  return body.data;
}

/** POST /work-items/{id}/subtasks — create a child under an existing item. */
export function addSubtask(id: string, input: AddSubtask): Promise<CreateWorkItemResponse> {
  return authedRequest<CreateWorkItemResponse>(`/work-items/${id}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** DELETE /work-items/{id} — soft-delete (recoverable from trash). */
export function deleteWorkItem(id: string): Promise<void> {
  return authedRequest<void>(`/work-items/${id}`, { method: 'DELETE' });
}

/** POST /work-items/{id}/restore — restore a soft-deleted item from trash. */
export async function restoreWorkItem(id: string): Promise<WorkItem> {
  const body = await authedRequest<ResourceEnvelope<WorkItem>>(`/work-items/${id}/restore`, {
    method: 'POST',
  });
  return body.data;
}

/** POST /work-items/{id}/labels — apply a label. */
export function addLabel(id: string, labelId: string): Promise<void> {
  return authedRequest<void>(`/work-items/${id}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labelId }),
  });
}

/** DELETE /work-items/{id}/labels/{labelId} — remove a label. */
export function removeLabel(id: string, labelId: string): Promise<void> {
  return authedRequest<void>(`/work-items/${id}/labels/${labelId}`, { method: 'DELETE' });
}
