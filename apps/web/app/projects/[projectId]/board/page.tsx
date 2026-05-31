import { BoardClient } from './board-client';

/**
 * Kanban Board page (US3, T060). Server shell that resolves the route `projectId` and
 * mounts the interactive `BoardClient` (drag-to-move via `@dnd-kit`). Live, per-request.
 */
export const dynamic = 'force-dynamic';

export default async function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <BoardClient projectId={projectId} />;
}
