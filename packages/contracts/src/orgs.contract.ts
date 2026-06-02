import { z } from 'zod';
import { type Role, type UserSummary, roleSchema } from './common.contract';
import type { AuthResult } from './identity.contract';

/**
 * Orgs DTOs (M0, single contract source; OpenAPI `/setup` + `/orgs` + `/workspaces` +
 * `/memberships` + `/invites`). Organizations & settings, workspaces, memberships/roles,
 * invitations, first-run onboarding (FR-TEN-002/004/006, FR-RBAC-001/003, FR-AUTH-010/011).
 * Request bodies are `.strict()`. The org `Role` enum + `Workspace`/`UserSummary` live in
 * `common.contract` (shared, no cycle); `OrgSettings` mirrors `@rytask/db`'s storage type.
 */

/** Organization settings DTO (FR-TEN-004) — structurally matches `@rytask/db`'s `OrgSettings`. */
export const orgSettingsSchema = z
  .object({
    timezone: z.string().min(1).max(64).optional(),
    locale: z.string().min(2).max(35).optional(),
    weekStart: z.enum(['SUNDAY', 'MONDAY']).optional(),
    workingDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    workingHours: z.object({ start: z.string(), end: z.string() }).strict().optional(),
    logoUrl: z.string().url().nullable().optional(),
    allowPublicSignup: z.boolean().optional(),
  })
  .strict();
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

/** PATCH /orgs/current — partial settings update (all fields optional). */
export const updateOrgSettingsSchema = orgSettingsSchema;
export type UpdateOrgSettings = z.infer<typeof updateOrgSettingsSchema>;

/** POST /setup — bootstrap the initial org + owner + workspace + starter project (FR-AUTH-010). */
export const bootstrapSchema = z
  .object({
    organizationName: z.string().min(1).max(120),
    ownerName: z.string().min(1).max(120),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8).max(200),
  })
  .strict();
export type BootstrapRequest = z.infer<typeof bootstrapSchema>;

/** POST /orgs/current/transfer-ownership (Owner-only) (FR-RBAC-003). */
export const transferOwnershipSchema = z
  .object({
    toUserId: z.string().uuid(),
    demoteSelfTo: roleSchema.optional(),
  })
  .strict();
export type TransferOwnership = z.infer<typeof transferOwnershipSchema>;

/** PATCH /memberships/{userId} — change a member's role (Admin+; last-owner protected). */
export const setRoleSchema = z
  .object({
    role: roleSchema,
  })
  .strict();
export type SetRole = z.infer<typeof setRoleSchema>;

/** POST /invites — invite by email or create a shareable link, with a pre-assigned role. */
export const createInviteSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    role: roleSchema,
    workspaceId: z.string().uuid().nullable().optional(),
    expiresInHours: z.number().int().min(1).max(8760).default(168),
  })
  .strict();
export type CreateInvite = z.infer<typeof createInviteSchema>;

/** POST /invites/{token}/accept — name+password required only for a brand-new invitee. */
export const acceptInviteSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .strict();
export type AcceptInvite = z.infer<typeof acceptInviteSchema>;

// ─────────────────────────────────────────────────────────── response payloads

/** OpenAPI `SetupState`. */
export interface SetupState {
  available: boolean;
}

/** OpenAPI `Organization`. */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  settings: OrgSettings;
}

/** OpenAPI `Membership`. */
export interface Membership {
  userId: string;
  user: UserSummary;
  role: Role;
  deactivatedAt: string | null;
}

/** OpenAPI `Invitation`. */
export interface Invitation {
  id: string;
  email: string | null;
  role: Role;
  invitedByUserId: string | null;
  expiresAt: string;
  createdAt: string;
}

/** OpenAPI `InvitationCreated` — adds the shareable accept URL (link invites). */
export interface InvitationCreated extends Invitation {
  acceptUrl: string;
}

/** OpenAPI `InvitePreview` — public preview shown before accepting. */
export interface InvitePreview {
  organizationName: string;
  role: Role;
  email: string | null;
}

/** Accepting an invite returns an authenticated session (OpenAPI `AuthResult`). */
export type AcceptInviteResult = AuthResult;
