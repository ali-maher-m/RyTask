import { z } from 'zod';

/**
 * Cross-cutting M0 DTOs shared by both `identity` and `orgs` (kept here to avoid a
 * contract import cycle). `Role` is the built-in org role; `UserSummary`/`Workspace` are
 * referenced by auth responses (identity) and membership/whoami payloads (orgs).
 */

/** Built-in org roles (mirrors the `role_type` enum), most→least privileged. */
export const ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Public user projection (never includes the password hash). */
export interface UserSummary {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

/** A workspace within an organization. */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
}
