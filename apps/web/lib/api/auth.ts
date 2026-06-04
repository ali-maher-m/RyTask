'use client';

import type { RequestVerificationRequest } from '@rytask/contracts';
import { publicRequest } from './http';

/**
 * Auth / onboarding resource module (D8). The core helpers (login, register, whoami, logout,
 * setup, password reset, verify-email, invite preview/accept) already live in `lib/api.ts` with
 * the silent-refresh behavior; they are re-exported here so callers import from one cohesive
 * `lib/api` layer. Only the additional `request-verification` call is defined locally.
 */
export {
  acceptInvite,
  bootstrap,
  confirmPasswordReset,
  getInvitePreview,
  getSetupState,
  login,
  logout,
  register,
  requestPasswordReset,
  verifyEmail,
  whoami,
} from './http';

/** POST /auth/request-verification — resend an email-verification link (uniform, no enumeration). */
export function requestVerification(body: RequestVerificationRequest): Promise<void> {
  return publicRequest<void>('/auth/request-verification', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
