import { z } from 'zod';

/**
 * Projects DTOs (single contract source; OpenAPI `Project`/`CreateProject`/`UpdateProject`/
 * `AddMember`). A project owns its statuses, key prefix, membership, and key sequence
 * (FR-PROJ-001/002). US4 (T071). Request bodies are `.strict()` (unknown fields → 400).
 */

/** Project membership roles (mirrors the `project_role` enum). */
export const PROJECT_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
export const projectRoleSchema = z.enum(PROJECT_ROLES);
export type ProjectRoleDto = z.infer<typeof projectRoleSchema>;

/** A project key prefix: an uppercase letter then 1–9 uppercase letters/digits (data-model §2.1). */
export const keyPrefixSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'keyPrefix must match ^[A-Z][A-Z0-9]{1,9}$');

/** POST /projects — create a project (seeds default statuses + counter + creator membership). */
export const createProjectSchema = z
  .object({
    name: z.string().min(1).max(120),
    keyPrefix: keyPrefixSchema,
    description: z.string().max(2000).optional(),
    icon: z.string().max(64).optional(),
    color: z.string().min(1).max(32).optional(),
    leadId: z.string().uuid().optional(),
  })
  .strict();
export type CreateProject = z.infer<typeof createProjectSchema>;

/** PATCH /projects/{id} — update / archive / restore (all fields optional). */
export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    color: z.string().min(1).max(32).optional(),
    leadId: z.string().uuid().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type UpdateProject = z.infer<typeof updateProjectSchema>;

/** POST /projects/{id}/members — add a member with a role (default MEMBER). */
export const addMemberSchema = z
  .object({
    userId: z.string().uuid(),
    role: projectRoleSchema.default('MEMBER'),
  })
  .strict();
export type AddMember = z.infer<typeof addMemberSchema>;

/** Project response payload (OpenAPI `Project`). */
export interface Project {
  id: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  icon: string | null;
  color: string;
  leadId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

/** A single project member (OpenAPI `MemberListEnvelope` item). */
export interface ProjectMember {
  userId: string;
  role: ProjectRoleDto;
  name: string;
}

/** Single-project envelope: `{ data }`. */
export interface ProjectResponse {
  data: Project;
}

/** Project list envelope: `{ data, pageInfo }` (keyset pagination, FR-PROJ-001). */
export interface ProjectListResponse {
  data: Project[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/** Member list envelope: `{ data, pageInfo }`. */
export interface MemberListResponse {
  data: ProjectMember[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}
