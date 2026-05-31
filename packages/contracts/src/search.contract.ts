import { z } from 'zod';

/**
 * Search DTOs (single contract source; OpenAPI `SearchResult`/`SearchEnvelope`). Tenant-
 * AND permission-scoped full-text search across work-item titles/descriptions, comments,
 * projects, labels, and users — ranked (Postgres FTS + `ts_rank_cd`, D8). US8 (T120).
 */

/** The kinds of entity a search hit can reference (OpenAPI `SearchResult.type`). */
export const searchResultTypes = ['work_item', 'comment', 'project', 'label', 'user'] as const;
export type SearchResultType = (typeof searchResultTypes)[number];

/**
 * GET /search query params. `q` is the required search term; `types` is an optional
 * comma list to restrict the result kinds; `limit` caps the page (default 20, max 50 —
 * the command palette shows a short ranked list). Unknown params are rejected (`.strict`).
 */
export const searchQuerySchema = z
  .object({
    q: z.string().min(1).max(256),
    types: z.string().optional(),
    limit: z.coerce.number().int().positive().max(50).default(20),
  })
  .strict();
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** A single ranked search hit (OpenAPI `SearchResult`). */
export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  /** A short text excerpt (e.g. the description/comment match), or null. */
  snippet: string | null;
  /** Relevance score (higher = better); FTS hits use `ts_rank_cd`, ILIKE hits a constant. */
  rank: number;
  /** The owning project for a work_item/comment hit (or the project itself); null otherwise. */
  projectId: string | null;
}

/** Search response envelope: `{ data }` (a flat ranked list). */
export interface SearchEnvelope {
  data: SearchResult[];
}
