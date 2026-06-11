import { RequireAuth } from '@/components/require-auth';
import { ReportsClient } from './reports-client';

/**
 * Reports page (M4 US1/US2/US4, FR-RPT-001/002). Server shell that mounts the interactive
 * `ReportsClient` — the flagship "Where did my time go?" report: range/scope controls, a
 * plain-language narrative, the planned-vs-interruption headline split, a per-week table, the top
 * time sinks, the interruption ledger, and CSV export. All data is read-only and visibility-scoped
 * server-side. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsClient />
    </RequireAuth>
  );
}
