'use client';

import type {
  Comment,
  CommentEnvelope,
  CommentListResponse,
  CreateComment,
} from '@rytask/contracts';
import { authedRequest } from './http';

/** Comments resource module (D8). Threaded markdown comments under a work item. */

/** GET /work-items/{itemId}/comments — walk every page of the thread. */
export async function listComments(itemId: string): Promise<Comment[]> {
  const all: Comment[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);
    const page = await authedRequest<CommentListResponse>(
      `/work-items/${itemId}/comments?${params.toString()}`,
    );
    all.push(...page.data);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
  } while (cursor);
  return all;
}

/** POST /work-items/{itemId}/comments — post a comment / threaded reply (@mentions notify). */
export async function createComment(itemId: string, input: CreateComment): Promise<Comment> {
  const body = await authedRequest<CommentEnvelope>(`/work-items/${itemId}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return body.data;
}
