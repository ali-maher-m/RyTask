'use client';

import type { SearchEnvelope, SearchResult } from '@rytask/contracts';
import { authedRequest } from './http';

/** Search resource module (D8). Ranked full-text search, tenant/permission-scoped server-side. */

/** GET /search?q= — ranked hits across items/comments/projects/labels/users (scoped to the tenant). */
export async function search(q: string, types?: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  if (types) params.set('types', types);
  const body = await authedRequest<SearchEnvelope>(`/search?${params.toString()}`);
  return body.data;
}
