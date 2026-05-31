import { z } from 'zod';

/**
 * Labels DTOs (single contract source; OpenAPI `Label` / `CreateStatus`-style create).
 * Workspace-scoped labels (FR-LBL-001, D14): create by name (+ optional color), list.
 * US2 (T039).
 */

/** POST /labels — create a workspace label; unknown fields rejected (`.strict`). */
export const createLabelSchema = z
  .object({
    name: z.string().min(1).max(60),
    color: z.string().min(1).max(32).optional(),
  })
  .strict();
export type CreateLabel = z.infer<typeof createLabelSchema>;

/** Label response payload (OpenAPI `Label`). */
export interface Label {
  id: string;
  name: string;
  color: string;
}

/** List envelope: `{ data }` (no pagination — labels are a small workspace set). */
export interface LabelListResponse {
  data: Label[];
}
