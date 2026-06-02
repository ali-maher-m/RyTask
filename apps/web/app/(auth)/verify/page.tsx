import { VerifyEmailClient } from './verify-client';

/**
 * Email-verification page (US6, T090, FR-AUTH-003). Server shell that mounts the interactive
 * `VerifyEmailClient`, which reads the verification token from the emailed link (`?token=…`) and
 * `POST /auth/verify-email`s it to confirm the address. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function VerifyEmailPage() {
  return <VerifyEmailClient />;
}
