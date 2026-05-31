import { z } from 'zod';

/**
 * Shared pagination + envelope contract (contracts/README.md, ADR-005 / FR-VIEW-010).
 * Keyset cursor pagination — no OFFSET on hot lists (SC-011).
 */

/** Cursor pagination query params. `limit` default 50, max 200. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** The `pageInfo` block carried by every list payload. */
export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
  hasNextPage: z.boolean(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;

/** List payload envelope: `{ data, pageInfo }`. */
export interface CursorPage<T> {
  data: T[];
  pageInfo: PageInfo;
}

/** Success envelope for a single resource: `{ statusCode, message, data }`. */
export interface SuccessEnvelope<T> {
  statusCode: number;
  message: string;
  data: T;
}

/** Error envelope (matches the scaffold convention / OpenAPI `ErrorEnvelope`). */
export interface ErrorEnvelope {
  error: string;
  statusCode: number;
  message: string[];
  timestamp: string;
  path: string;
}
