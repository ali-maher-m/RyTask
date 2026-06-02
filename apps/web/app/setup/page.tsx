import { SetupClient } from './setup-client';

/**
 * First-run onboarding page (US1, T041, FR-AUTH-010, SC-001). Server shell that mounts the
 * interactive `SetupClient`, which checks `GET /api/v1/setup` and, while onboarding is open,
 * walks a non-technical wizard that `POST /setup`s the first organization, owner, workspace,
 * and starter project — then lands the owner signed in. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function SetupPage() {
  return <SetupClient />;
}
