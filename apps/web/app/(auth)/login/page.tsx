import { LoginClient } from './login-client';

/**
 * Sign-in page (US2, T059, FR-AUTH-001). Server shell that mounts the interactive `LoginClient`,
 * which `POST /auth/login`s, stores the returned tokens, and lands the user in the app. Silent
 * refresh is handled centrally by the shared API client. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginClient />;
}
