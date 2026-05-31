import { z } from 'zod';

/**
 * Statuses DTOs (single contract source; OpenAPI `Status`/`CreateStatus`). Per-project,
 * customizable workflow columns mapped to a fixed category (FR-WF-001/002, ADR-004).
 * US3 (T056). Request bodies are `.strict()` (unknown fields → 400).
 */

/** The five fixed status categories (ordinal order drives the board left→right). */
export const STATUS_CATEGORIES = [
  'BACKLOG',
  'UNSTARTED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
] as const;
export const statusCategorySchema = z.enum(STATUS_CATEGORIES);
export type StatusCategory = z.infer<typeof statusCategorySchema>;

/** POST /projects/{id}/statuses — add a status mapped to a category. */
export const createStatusSchema = z
  .object({
    name: z.string().min(1).max(60),
    category: statusCategorySchema,
    color: z.string().min(1).max(32).optional(),
    position: z.number().int().optional(),
  })
  .strict();
export type CreateStatus = z.infer<typeof createStatusSchema>;

/** PATCH /statuses/{id} — rename / recolor / recategorize (all fields optional). */
export const updateStatusSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    category: statusCategorySchema.optional(),
    color: z.string().min(1).max(32).optional(),
  })
  .strict();
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

/** POST /projects/{id}/statuses/reorder — total ordering of the project's statuses. */
export const reorderStatusesSchema = z
  .object({
    orderedIds: z.array(z.string().uuid()).min(1),
  })
  .strict();
export type ReorderStatuses = z.infer<typeof reorderStatusesSchema>;

/** Status response payload (OpenAPI `Status`). */
export interface Status {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  position: number;
}

/** List envelope: `{ data }` (no pagination — a project's status set is small). */
export interface StatusListResponse {
  data: Status[];
}
