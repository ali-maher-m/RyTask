import { ResetRequestClient } from './reset-client';

/**
 * Password-reset request page (US6, T090, FR-AUTH-003, SC-010). Server shell that mounts the
 * interactive `ResetRequestClient`, which `POST /auth/request-password-reset`s. The response is
 * uniform whether or not the email exists (no account enumeration). Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function ResetRequestPage() {
  return <ResetRequestClient />;
}
