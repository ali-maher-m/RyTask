'use client';

import type {
  CreateStatus,
  ReorderStatuses,
  Status,
  StatusListResponse,
  UpdateStatus,
} from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Statuses resource module (D8). A project's board columns, category-mapped + ordered. */

/** GET /projects/{id}/statuses — ordered left→right (board columns). */
export async function listStatuses(projectId: string): Promise<Status[]> {
  const body = await authedRequest<StatusListResponse>(`/projects/${projectId}/statuses`);
  return body.data;
}

/** POST /projects/{id}/statuses — add a status mapped to a category. */
export async function createStatus(projectId: string, input: CreateStatus): Promise<Status> {
  const body = await authedRequest<ResourceEnvelope<Status>>(`/projects/${projectId}/statuses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** PATCH /statuses/{id} — rename / recolor / recategorize. */
export async function updateStatus(statusId: string, input: UpdateStatus): Promise<Status> {
  const body = await authedRequest<ResourceEnvelope<Status>>(`/statuses/${statusId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /statuses/{id} — remove a status (server requires re-mapping a populated status). */
export function deleteStatus(statusId: string): Promise<void> {
  return authedRequest<void>(`/statuses/${statusId}`, { method: 'DELETE' });
}

/** POST /projects/{id}/statuses/reorder — set the total ordering of the project's statuses. */
export function reorderStatuses(projectId: string, input: ReorderStatuses): Promise<void> {
  return authedRequest<void>(`/projects/${projectId}/statuses/reorder`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
