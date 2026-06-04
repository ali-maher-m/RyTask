import { RequireAuth } from '@/components/require-auth';
import { ProjectSettingsClient } from './settings-client';

/**
 * Project settings page (US6, T062/T063, FR-WEB-051/052). Server shell resolving the route
 * `projectId` and mounting the interactive settings surface (project · statuses · labels).
 */
export const dynamic = 'force-dynamic';

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <RequireAuth>
      <ProjectSettingsClient projectId={projectId} />
    </RequireAuth>
  );
}
