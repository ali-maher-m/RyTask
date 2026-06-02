import { InviteClient } from './invite-client';

/**
 * Accept-invite landing (US3, T069, FR-AUTH-011, SC-004). Server shell that reads the invite
 * token from the URL and mounts the interactive `InviteClient`, which previews the organization +
 * pre-assigned role (`GET /invites/{token}`) and then joins (`POST /invites/{token}/accept`),
 * landing the new member signed in at exactly that role. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteClient token={token} />;
}
