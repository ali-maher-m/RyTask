import { z } from 'zod';
import type { Role, UserSummary, Workspace } from './common.contract';

/**
 * Identity DTOs (M0, single contract source; OpenAPI `/auth/*` + `/api-tokens`). Auth,
 * sessions, PATs, verify/reset, whoami (FR-AUTH-001/002/003/007). Request bodies are
 * `.strict()` (unknown fields → 400). Response payloads are plain interfaces (mirrors the
 * M1 contract style). Cross-file type imports from `orgs.contract` are type-only (no cycle).
 */

const passwordSchema = z.string().min(8).max(200);
const emailSchema = z.string().email();

/** POST /auth/register — create an account (only when org allowPublicSignup). */
export const registerSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
export type RegisterRequest = z.infer<typeof registerSchema>;

/** POST /auth/login — email + password → access + refresh. */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginSchema>;

/** POST /auth/refresh — rotate the refresh token. */
export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();
export type RefreshRequest = z.infer<typeof refreshSchema>;

/** POST /auth/verify-email — consume an EMAIL_VERIFY one-time token. */
export const verifyEmailSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;

/** POST /auth/request-password-reset — uniform response (no enumeration, SC-010). */
export const requestPasswordResetSchema = z
  .object({
    email: emailSchema,
  })
  .strict();
export type RequestPasswordResetRequest = z.infer<typeof requestPasswordResetSchema>;

/** POST /auth/confirm-password-reset — consume a PASSWORD_RESET token + set new password. */
export const confirmPasswordResetSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict();
export type ConfirmPasswordResetRequest = z.infer<typeof confirmPasswordResetSchema>;

/** Personal Access Token kinds mintable in M0 (OAUTH is reserved for v2). */
export const apiTokenTypeSchema = z.enum(['PAT', 'MCP']);
export type ApiTokenType = z.infer<typeof apiTokenTypeSchema>;

/** POST /api-tokens — mint a PAT (secret returned ONCE). */
export const createApiTokenSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: apiTokenTypeSchema.default('PAT'),
    scopes: z.array(z.string().min(1).max(120)).default([]),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();
export type CreateApiToken = z.infer<typeof createApiTokenSchema>;

// ─────────────────────────────────────────────────────────── response payloads

/** OpenAPI `AuthResult` — returned by register/login/refresh/bootstrap/accept-invite. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds (≤ 900). */
  expiresIn: number;
  user: UserSummary;
}

/** OpenAPI `WhoAmI` — the resolved principal (FR-INT-MCP-001). */
export interface WhoAmI {
  user: UserSummary;
  organizationId: string;
  activeWorkspaceId: string | null;
  role: Role;
  /** PAT scopes (empty for UI sessions). */
  scopes: string[];
  workspaces: Workspace[];
}

/** OpenAPI `ApiToken` — a listed PAT (never includes the secret). */
export interface ApiTokenDto {
  id: string;
  name: string;
  type: ApiTokenType;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** OpenAPI `ApiTokenSecret` — the mint response; `secret` is shown ONCE (SC-002). */
export interface ApiTokenSecret extends ApiTokenDto {
  secret: string;
}
