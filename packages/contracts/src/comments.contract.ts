import { z } from 'zod';

/**
 * Comments DTOs (single contract source; OpenAPI `Comment`/`CreateComment`). Threaded
 * markdown comments with @mentions (FR-COLLAB-001/002, D9/D15). US7 (T111).
 */

/**
 * POST /work-items/{id}/comments — markdown body, optional `parentId` for a threaded
 * reply. The `work_item_id` is implied by the path (NOT accepted in the body). Unknown
 * fields are rejected (`.strict`). The "reply parent belongs to this item" rule is
 * enforced in the provider, not via a Zod `.refine` (TS2589).
 */
export const createCommentSchema = z
  .object({
    body: z.string().min(1).max(10_000),
    parentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateComment = z.infer<typeof createCommentSchema>;

/** Comment response payload (OpenAPI `Comment`). `mentions` are the resolved user ids. */
export interface Comment {
  id: string;
  workItemId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  mentions?: string[];
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
}

/** Single-comment envelope: `{ data }` (POST response). */
export interface CommentEnvelope {
  data: Comment;
}

/** Comment-list envelope: `{ data, pageInfo }` (GET response). */
export interface CommentListResponse {
  data: Comment[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}
