import { RequireAuth } from '@/components/require-auth';
import { NewProjectClient } from './new-project-client';

/**
 * New-project page (US6, T061, FR-WEB-050). Server shell mounting the create-mode project form.
 */
export const dynamic = 'force-dynamic';

export default function NewProjectPage() {
  return (
    <RequireAuth>
      <NewProjectClient />
    </RequireAuth>
  );
}
