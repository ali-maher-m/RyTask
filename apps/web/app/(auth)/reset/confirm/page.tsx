import { ResetConfirmClient } from './confirm-client';

/**
 * Password-reset confirmation page (US6, T090, FR-AUTH-003). Server shell that mounts the
 * interactive `ResetConfirmClient`, which reads the single-use token from the emailed link
 * (`?token=…`) and `POST /auth/confirm-password-reset`s the new password. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function ResetConfirmPage() {
  return <ResetConfirmClient />;
}
