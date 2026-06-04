import { RequireAuth } from '@/components/require-auth';
import { ListClient } from './list-client';

/**
 * List view page (US3, T061). Server shell that resolves the route `projectId` and mounts
 * the interactive `ListClient` (inline edit via `PATCH /work-items/{id}`). Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default async function ListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <RequireAuth>
      <ListClient projectId={projectId} />
    </RequireAuth>
  );
}
