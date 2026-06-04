import { RequireAuth } from '@/components/require-auth';
import { SavedViewClient } from './saved-view-client';

/**
 * Saved-view route (US7, T069, route-map). Server shell that resolves the route `viewId` and mounts
 * the client that restores the saved view's full config (filter AST + grouping + multi-key sort +
 * layout) and opens it on the owning project's Board/List. Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default async function SavedViewPage({
  params,
}: {
  params: Promise<{ viewId: string }>;
}) {
  const { viewId } = await params;
  return (
    <RequireAuth>
      <SavedViewClient viewId={viewId} />
    </RequireAuth>
  );
}
