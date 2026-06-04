import { RequireAuth } from '../../components/require-auth';
import { InboxClient } from './inbox-client';

/**
 * Notification inbox page (US7, T115, FR-NOTIF-002, D10). Server shell that mounts the
 * interactive `InboxClient`, which reads `GET /api/v1/notifications` (+ `/unread-count`) and
 * mutates rows via `PATCH /notifications/{id}` (mark read/unread, snooze, archive). Live,
 * per-request.
 */
export const dynamic = 'force-dynamic';

export default function InboxPage() {
  return (
    <RequireAuth>
      <InboxClient />
    </RequireAuth>
  );
}
