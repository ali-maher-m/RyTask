import { MembersClient } from './members-client';

/**
 * Members administration (US8/US3, T108, FR-RBAC-001/003, SC-004/007). Server shell that mounts
 * the interactive `MembersClient`: list members and change/remove roles (`GET/PATCH/DELETE
 * /memberships`), and invite teammates by email or shareable link with a pre-assigned role
 * (`GET/POST /invites`, `DELETE /invites/{id}/_revoke`). Owner/Admin only. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function MembersPage() {
  return <MembersClient />;
}
