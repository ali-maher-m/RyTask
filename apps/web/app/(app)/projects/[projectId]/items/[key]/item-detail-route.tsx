'use client';

import { ItemDetail } from '@/components/item-detail';
import { SubtaskTree } from '@/components/subtask-tree';
import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import {
  type MappedError,
  listAllWorkItems,
  listLabels,
  listProjectMembers,
  listStatuses,
  mapApiError,
} from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useSession } from '@/lib/auth/session-context';
import type { Label, ProjectRoleDto, Status, WorkItem } from '@rytask/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Client surface for the item-detail route (US3/US5, T046/T055/T056). Resolves the work item by its
 * human key (there is no get-by-key endpoint, so it lists the project's items and matches
 * client-side — M1 projects are small), loads the project's statuses + workspace labels, and mounts
 * `ItemDetail`. Tenant-safe (D10, FR-WEB-101): a 403/404 (or a key that isn't in this project) maps
 * through `mapApiError` to a friendly SurfaceState with **no** foreign data. Editing is gated by the
 * capability map (cosmetic); deleting routes back to the board.
 */

const PAGE: React.CSSProperties = {
  maxWidth: 'var(--container-prose)',
  margin: '0 auto',
  padding: 'var(--space-4)',
};

export function ItemDetailRoute({ projectId, itemKey }: { projectId: string; itemKey: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const { principal } = useSession();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [projectRole, setProjectRole] = useState<ProjectRoleDto | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<MappedError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, st, lb] = await Promise.all([
        listAllWorkItems({ projectId }),
        listStatuses(projectId),
        listLabels(),
      ]);
      setStatuses(st);
      setLabels(lb);
      const found = items.find((i) => i.key === itemKey) ?? null;
      if (!found) {
        // The key isn't in this project (or this tenant) — a tenant-safe not-found, zero foreign data.
        setError({ kind: 'not-found', status: 404, message: 'We couldn’t find that item.' });
        setItem(null);
      } else {
        setItem(found);
      }
    } catch (e) {
      setError(mapApiError(e));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, itemKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const userId = principal?.user.id;
    if (!userId) return;
    listProjectMembers(projectId)
      .then((members) => setProjectRole(members.find((m) => m.userId === userId)?.role))
      .catch(() => setProjectRole(undefined));
  }, [projectId, principal]);

  const backToBoard = `/projects/${projectId}/board`;
  const backLink = (
    <Link href={backToBoard} style={{ color: 'var(--accent)' }}>
      Back to board
    </Link>
  );

  if (loading) {
    return (
      <div style={PAGE}>
        <SurfaceLoading label="Loading item…" />
      </div>
    );
  }
  if (error || !item) {
    return (
      <div style={PAGE}>
        <SurfaceFeedback
          error={error ?? { kind: 'error', status: null, message: 'Something went wrong.' }}
          onRetry={load}
          action={backLink}
        />
      </div>
    );
  }

  const canWrite = can('workitem:write', { projectRole });

  return (
    <div style={PAGE}>
      <p style={{ marginTop: 0 }}>
        <Link href={backToBoard} style={{ color: 'var(--accent)' }}>
          ← Back to board
        </Link>
      </p>
      <ItemDetail
        item={item}
        statuses={statuses}
        labels={labels}
        canEdit={canWrite}
        onChange={setItem}
        onDeleted={() => router.push(backToBoard)}
        onClose={() => router.push(backToBoard)}
      />
      {/* US8: break work down into nested sub-tasks (≥3 levels) on the item-detail surface. */}
      <SubtaskTree root={item} statuses={statuses} onChange={setItem} />
    </div>
  );
}
