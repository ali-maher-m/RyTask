'use client';

import type { CreateLabel, Label, LabelListResponse } from '@rytask/contracts';
import type { ResourceEnvelope } from './client';
import { authedRequest } from './http';

/** Labels resource module (D8). Workspace labels — appliable + filterable. */

/** GET /labels — the workspace's label set. */
export async function listLabels(): Promise<Label[]> {
  const body = await authedRequest<LabelListResponse>('/labels');
  return body.data;
}

/** POST /labels — create a workspace label. */
export async function createLabel(input: CreateLabel): Promise<Label> {
  const body = await authedRequest<ResourceEnvelope<Label>>('/labels', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}
