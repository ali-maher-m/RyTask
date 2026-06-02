import { RegisterClient } from './register-client';

/**
 * Sign-up page (US2, T059, FR-AUTH-001). Server shell that mounts the interactive
 * `RegisterClient`, which `POST /auth/register`s when the organization allows public signup —
 * otherwise it explains the workspace is invite-only. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return <RegisterClient />;
}
