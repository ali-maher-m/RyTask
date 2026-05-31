import { z } from 'zod';

/**
 * Work-items DTOs (single contract source; OpenAPI `CreateWorkItem`/`WorkItem`).
 * Grows across US1/US2/US3/US6.
 */

export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

/** YYYY-MM-DD calendar date. */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/**
 * POST /work-items — title-only OR quick-add line; unknown fields rejected (`.strict`).
 * The "title or quickAdd required" rule is enforced in the controller (a Zod `.refine`
 * here produces a pathologically deep `ZodEffects` type that blows up `tsc`, TS2589).
 */
export const createWorkItemSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    title: z.string().min(1).max(500).optional(),
    quickAdd: z.string().min(1).optional(),
    description: z.string().optional(),
    statusId: z.string().uuid().optional(),
    priority: prioritySchema.optional(),
    assigneeId: z.string().uuid().optional(),
    labelIds: z.array(z.string().uuid()).optional(),
    parentId: z.string().uuid().optional(),
    estimateValue: z.number().optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    dueDate: dateString.optional(),
  })
  .strict();
export type CreateWorkItem = z.infer<typeof createWorkItemSchema>;

/**
 * POST /work-items/{id}/subtasks — create a child under an existing item (US6, FR-HIER-001,
 * research D4). `projectId` and `parentId` are implied by the path (the parent's project +
 * the path id), so they are NOT accepted in the body; everything else mirrors create.
 * Unknown fields are rejected (`.strict`). Cycle/depth are enforced in the provider against
 * the hierarchy policy, not via a Zod `.refine` (TS2589).
 */
export const addSubtaskSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    quickAdd: z.string().min(1).optional(),
    description: z.string().optional(),
    statusId: z.string().uuid().optional(),
    priority: prioritySchema.optional(),
    assigneeId: z.string().uuid().optional(),
    labelIds: z.array(z.string().uuid()).optional(),
    estimateValue: z.number().optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    dueDate: dateString.optional(),
  })
  .strict();
export type AddSubtask = z.infer<typeof addSubtaskSchema>;

/** A quick-add token that could not be resolved (surfaced, never dropped — FR-WI-004). */
export interface UnresolvedToken {
  token: string;
  kind: 'assignee' | 'label' | 'priority' | 'date';
}

/** Work item response payload (OpenAPI `WorkItem`). `key` is the derived `{prefix}-{number}`. */
export interface WorkItem {
  id: string;
  key: string;
  number: number;
  projectId: string;
  title: string;
  description: string | null;
  statusId: string;
  priority: Priority;
  assigneeId: string | null;
  reporterId: string | null;
  parentId: string | null;
  childCount?: number;
  labelIds?: string[];
  estimateValue: number | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  overdue?: boolean;
  position: number | null;
  version: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Create response envelope: `{ data, meta: { unresolved } }` (quickstart §5). */
export interface CreateWorkItemResponse {
  data: WorkItem;
  meta: { unresolved: UnresolvedToken[] };
}

/**
 * PATCH /work-items/{id} — partial field update with optimistic concurrency (US2,
 * FR-WI-003/006/009, FR-DATE-001/002, FR-PRIO-001). `version` is the client's expected
 * current version; a mismatch → 409. Unknown fields are rejected (`.strict`). Nullable
 * fields accept `null` to clear them. Cross-field rules (e.g. start<=end) are enforced in
 * the provider, not via `.refine` here (avoids the TS2589 deep-instantiation blowup).
 */
export const updateWorkItemSchema = z
  .object({
    version: z.number().int().nonnegative(),
    title: z.string().min(1).max(500).optional(),
    description: z.string().nullable().optional(),
    statusId: z.string().uuid().optional(),
    priority: prioritySchema.optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    estimateValue: z.number().nullable().optional(),
    startDate: dateString.nullable().optional(),
    endDate: dateString.nullable().optional(),
    dueDate: dateString.nullable().optional(),
  })
  .strict();
export type UpdateWorkItem = z.infer<typeof updateWorkItemSchema>;

/** One immutable per-item activity entry (OpenAPI `ActivityEntry`, FR-WI-009). */
export interface ActivityEntry {
  id: string;
  actorId: string | null;
  action: string;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
}

/**
 * POST /work-items/{id}/move — board drag (US3, FR-VIEW-001). Optimistic `version`
 * (stale → 409). `statusId` changes the column; `beforeId`/`afterId` name the sibling(s)
 * to place the card between (fractional rank). Unknown fields rejected (`.strict`).
 */
export const moveWorkItemSchema = z
  .object({
    version: z.number().int().nonnegative(),
    statusId: z.string().uuid().optional(),
    beforeId: z.string().uuid().optional(),
    afterId: z.string().uuid().optional(),
  })
  .strict();
export type MoveWorkItem = z.infer<typeof moveWorkItemSchema>;

/**
 * GET /work-items query params (List / Board / smart views). `filter` is base64(JSON
 * filter AST); `smart` selects a code-defined live view; `group`/`sort` per filter-dsl.md.
 * Keyset cursor pagination (`cursor`/`limit`). Unknown fields rejected (`.strict`).
 */
export const listWorkItemsQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    filter: z.string().optional(),
    smart: z.enum(['my-issues', 'due-soon', 'overdue', 'urgent', 'my-work']).optional(),
    group: z.enum(['status', 'assignee', 'priority', 'project']).optional(),
    sort: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .strict();
export type ListWorkItemsQuery = z.infer<typeof listWorkItemsQuerySchema>;

/** GET /work-items response: keyset page of items (filter-dsl.md). */
export interface WorkItemListResponse {
  data: WorkItem[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}
