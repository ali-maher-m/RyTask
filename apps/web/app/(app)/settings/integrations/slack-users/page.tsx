import { SlackUsersClient } from './slack-users-client';

/**
 * Slack user mapping settings (M3, US5, FR-WEB-102). Server shell that mounts the interactive
 * `SlackUsersClient`: admins review which Slack users are linked to which RyTask teammates,
 * manually link an unmatched user, and unlink — so tasks captured from Slack attribute to the
 * right person. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function SlackUsersPage() {
  return <SlackUsersClient />;
}
