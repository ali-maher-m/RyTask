import { RequireAuth } from '@/components/require-auth';
import { WeekClient } from './week-client';

/**
 * "My week" page (M4 US3, FR-RPT-007). Server shell that mounts the interactive `WeekClient` — one
 * user's Mon–Sun week: total tracked + the planned/interruption split, the items they tracked time on
 * (tracked-beside-estimate), the items completed that week, and a paste-ready "Copy as text" digest.
 * Read-only and visibility-scoped server-side. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function MyWeekPage() {
  return (
    <RequireAuth>
      <WeekClient />
    </RequireAuth>
  );
}
