'use client';

import { LabelManager } from '@/components/label-manager';
import { ProjectForm } from '@/components/project-form';
import { StatusManager } from '@/components/status-manager';
import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import {
  type MappedError,
  createLabel,
  createStatus,
  deleteStatus,
  getProject,
  listAllWorkItems,
  listLabels,
  listProjectMembers,
  listStatuses,
  mapApiError,
  reorderStatuses,
  updateStatus,
} from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useSession } from '@/lib/auth/session-context';
import type {
  CreateLabel,
  CreateStatus,
  Label,
  Project,
  ProjectMember,
  ProjectRoleDto,
  Status,
  UpdateStatus,
} from '@rytask/contracts';
import { ForbiddenState } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Project settings (US6, T062/T063, FR-WEB-051/052). One surface for a project admin to edit the
 * project itself, customize its categorized statuses (add / rename / reorder / recolor /
 * recategorize / delete-with-re-map), and manage workspace labels. Data flows from the consolidated
 * `@/lib/api`; the mutating UI gates cosmetically on `project:admin` (org OWNER/ADMIN bypass the
 * project role) and the server stays authoritative. Tenant-safe loads via `mapApiError`. Token-only.
 */

interface SettingsData {
  project: Project;
  statuses: Status[];
  labels: Label[];
  members: ProjectMember[];
  itemCounts: Record<string, number>;
}

export function ProjectSettingsClient({ projectId }: { projectId: string }) {
  const { can } = useCapabilities();
  const { principal } = useSession();
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [project, statuses, items, members, labels] = await Promise.all([
        getProject(projectId),
        listStatuses(projectId),
        listAllWorkItems({ projectId }),
        listProjectMembers(projectId),
        listLabels(),
      ]);
      const itemCounts: Record<string, number> = {};
      for (const item of items) {
        itemCounts[item.statusId] = (itemCounts[item.statusId] ?? 0) + 1;
      }
      setData({ project, statuses, labels, members, itemCounts });
    } catch (e) {
      setError(mapApiError(e));
      setData(null);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectRole: ProjectRoleDto | undefined = useMemo(() => {
    const userId = principal?.user.id;
    return data?.members.find((m) => m.userId === userId)?.role;
  }, [data, principal]);

  const canAdmin = can('project:admin', { projectRole });

  // Run a settings mutation, then refresh so counts/order reflect the server's authoritative state.
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setActionError(mapApiError(e).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!data) {
    return (
      <main style={MAIN}>
        <Heading projectName={null} />
        {error ? (
          <SurfaceFeedback
            error={error}
            onRetry={load}
            action={
              <Link href="/projects" style={{ color: 'var(--accent)' }}>
                Back to projects
              </Link>
            }
          />
        ) : (
          <SurfaceLoading label="Loading project settings…" />
        )}
      </main>
    );
  }

  if (!canAdmin) {
    return (
      <main style={MAIN}>
        <Heading projectName={data.project.name} />
        <ForbiddenState description="Only a project admin can change these settings." />
      </main>
    );
  }

  return (
    <main style={MAIN}>
      <Heading projectName={data.project.name} />

      {actionError ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {actionError}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 'var(--space-5)', maxWidth: 'var(--container-prose)' }}>
        <ProjectForm project={data.project} members={data.members} onSaved={() => void load()} />

        <StatusManager
          statuses={data.statuses}
          itemCounts={data.itemCounts}
          busy={busy}
          canEdit={canAdmin}
          onCreate={(input: CreateStatus) => run(() => createStatus(projectId, input))}
          onUpdate={(id: string, input: UpdateStatus) => run(() => updateStatus(id, input))}
          onDelete={(id: string, reassignTo: string | null) =>
            run(() => deleteStatus(id, reassignTo))
          }
          onReorder={(orderedIds: string[]) =>
            run(() => reorderStatuses(projectId, { orderedIds }))
          }
        />

        <LabelManager
          labels={data.labels}
          busy={busy}
          canEdit={canAdmin}
          onCreate={(input: CreateLabel) => run(() => createLabel(input))}
        />
      </div>
    </main>
  );
}

function Heading({ projectName }: { projectName: string | null }) {
  return (
    <header style={{ marginBottom: 'var(--space-4)' }}>
      <p style={{ margin: 0 }}>
        <Link href="/projects" style={{ color: 'var(--accent)' }}>
          ← Projects
        </Link>
      </p>
      <h1 style={{ fontSize: 'var(--fs-h1)', margin: 'var(--space-1) 0 0' }}>
        {projectName ? `${projectName} settings` : 'Project settings'}
      </h1>
    </header>
  );
}

const MAIN: React.CSSProperties = { padding: 'var(--space-4)' };
