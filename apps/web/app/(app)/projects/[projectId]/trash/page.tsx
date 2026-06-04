import { RequireAuth } from '@/components/require-auth';
import { TrashClient } from './trash-client';

/**
 * Project Trash page (US3, T047, FR-WEB-023). Soft-deleted items are recoverable; this surface
 * lists what was trashed from this client and restores it (`POST /work-items/{id}/restore`).
 * Server shell resolves the route `projectId` and mounts the client.
 */
export const dynamic = 'force-dynamic';

export default async function TrashPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <RequireAuth>
      <TrashClient projectId={projectId} />
    </RequireAuth>
  );
}
