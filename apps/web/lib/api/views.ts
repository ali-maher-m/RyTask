'use client';

import type { SaveView, UpdateView, View, ViewListResponse, ViewResponse } from '@rytask/contracts';
import { authedRequest } from './http';

/** Saved-views resource module (D8/D14). Personal/shared views persisting a filter AST + sort. */

/** GET /views?projectId= — saved views (personal + shared) for a project. */
export async function listViews(projectId?: string): Promise<View[]> {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  const qs = params.toString();
  const body = await authedRequest<ViewListResponse>(`/views${qs ? `?${qs}` : ''}`);
  return body.data;
}

/** GET /views/{id} — one saved view (restores its full config). */
export async function getView(id: string): Promise<View> {
  const body = await authedRequest<ViewResponse>(`/views/${id}`);
  return body.data;
}

/** POST /views — save a view (filter AST + grouping + multi-key sort + layout). */
export async function saveView(input: SaveView): Promise<View> {
  const body = await authedRequest<ViewResponse>('/views', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** PATCH /views/{id} — update a saved view. */
export async function updateView(id: string, input: UpdateView): Promise<View> {
  const body = await authedRequest<ViewResponse>(`/views/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return body.data;
}

/** DELETE /views/{id} — delete a saved view. */
export function deleteView(id: string): Promise<void> {
  return authedRequest<void>(`/views/${id}`, { method: 'DELETE' });
}
