import { RequireAuth } from '@/components/require-auth';
import { ProjectsClient } from './projects-client';

/**
 * Projects index page (US6, T061, FR-WEB-050). Server shell that mounts the interactive
 * `ProjectsClient` — the project list + switcher with create / archive / delete. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default function ProjectsPage() {
  return (
    <RequireAuth>
      <ProjectsClient />
    </RequireAuth>
  );
}
