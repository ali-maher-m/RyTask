import { RequireAuth } from '@/components/require-auth';
import { MyWorkClient } from './my-work-client';

/**
 * "My Work" page (US4, T075, FR-PROJ-006). Server shell that mounts the interactive
 * `MyWorkClient`, which reads `GET /api/v1/work-items?smart=my-work` — the current user's
 * assigned items across every accessible project. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function MyWorkPage() {
  return (
    <RequireAuth>
      <MyWorkClient />
    </RequireAuth>
  );
}
