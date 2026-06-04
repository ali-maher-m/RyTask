import { OrganizationClient } from './organization-client';

/**
 * Organization settings (US8, T108, FR-TEN-004, FR-RBAC-003, SC-007). Server shell that mounts the
 * interactive `OrganizationClient`: edit org settings (`GET/PATCH /orgs/current`), transfer
 * ownership (`POST /orgs/current/transfer-ownership`, Owner-only), and soft-delete the org
 * (`DELETE /orgs/current`, Owner-only) with explicit confirmation. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function OrganizationPage() {
  return <OrganizationClient />;
}
