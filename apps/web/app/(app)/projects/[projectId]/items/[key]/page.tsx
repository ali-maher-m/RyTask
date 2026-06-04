import { RequireAuth } from '@/components/require-auth';
import { ItemDetailRoute } from './item-detail-route';

/**
 * Work-item detail page (US3, T046, FR-WEB-003/022/023). A stable, shareable URL keyed by the
 * item's **human key** (`/projects/{projectId}/items/{key}`) that restores the same surface on
 * reload, subject to permission. Server shell resolves the route params and mounts the client.
 */
export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; key: string }>;
}) {
  const { projectId, key } = await params;
  return (
    <RequireAuth>
      <ItemDetailRoute projectId={projectId} itemKey={decodeURIComponent(key)} />
    </RequireAuth>
  );
}
