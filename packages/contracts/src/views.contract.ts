import { z } from 'zod';

/**
 * Views DTOs (single contract source; OpenAPI `SaveView` / `View`). A saved view stores
 * a filter AST + multi-key sort + grouping + layout as JSON (filter-dsl.md, D6). PERSONAL
 * views are visible only to their owner; SHARED views to project members (FR-VIEW-008).
 * Smart views (My Issues, Due Soon, Overdue, Urgent) + My Work are NOT rows — they are
 * code-defined ASTs (D7), so they are not represented here. US5 (T084).
 *
 * `filters`/`grouping`/`layout` are opaque JSON objects and `sort` an array of objects:
 * the shape is the filter DSL, validated by the query engine at read time (the controller
 * validates the AST before persisting). We keep them as loose JSON here (not deep Zod
 * schemas) to avoid the TS2589 deep-instantiation blow-up on the strict object.
 */

/** A JSON value persisted verbatim in a view's filter/grouping/sort/layout columns. */
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

/** A JSON object (filter AST / grouping / layout). */
const jsonObject = z.record(jsonValue);

export const VIEW_KINDS = ['BOARD', 'LIST'] as const;
export const viewKindSchema = z.enum(VIEW_KINDS);
export type ViewKind = z.infer<typeof viewKindSchema>;

export const VIEW_SCOPES = ['PERSONAL', 'SHARED'] as const;
export const viewScopeSchema = z.enum(VIEW_SCOPES);
export type ViewScope = z.infer<typeof viewScopeSchema>;

/**
 * POST /views — save a view. `scope` defaults to PERSONAL; a `null`/absent `projectId`
 * is a cross-project view. `filters` is a filter AST (filter-dsl.md); `sort` is the
 * ordered multi-key list; `grouping`/`layout` are optional. Unknown fields rejected
 * (`.strict`).
 */
export const saveViewSchema = z
  .object({
    name: z.string().min(1).max(120),
    kind: viewKindSchema,
    scope: viewScopeSchema.default('PERSONAL'),
    projectId: z.string().uuid().nullable().optional(),
    filters: jsonObject.optional(),
    grouping: jsonObject.nullable().optional(),
    sort: z.array(jsonObject).optional(),
    layout: jsonObject.nullable().optional(),
  })
  .strict();
export type SaveView = z.infer<typeof saveViewSchema>;

/**
 * PATCH /views/{id} — partial update of a saved view. Every field is optional; unknown
 * fields rejected (`.strict`). `projectId` cannot be re-homed here (a view's project is
 * fixed at save; changing it would change who can see it) — it is intentionally omitted.
 */
export const updateViewSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    kind: viewKindSchema.optional(),
    scope: viewScopeSchema.optional(),
    filters: jsonObject.optional(),
    grouping: jsonObject.nullable().optional(),
    sort: z.array(jsonObject).optional(),
    layout: jsonObject.nullable().optional(),
  })
  .strict();
export type UpdateView = z.infer<typeof updateViewSchema>;

/** Saved-view response payload (OpenAPI `View`). */
export interface View {
  id: string;
  ownerId: string;
  projectId: string | null;
  name: string;
  kind: ViewKind;
  scope: ViewScope;
  filters: Record<string, unknown>;
  grouping: Record<string, unknown> | null;
  sort: Array<Record<string, unknown>>;
  layout: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/** Single-view envelope (OpenAPI `ViewEnvelope`). */
export interface ViewResponse {
  data: View;
}

/** List envelope (OpenAPI `ViewListEnvelope`; no pagination — a small per-user set). */
export interface ViewListResponse {
  data: View[];
}
