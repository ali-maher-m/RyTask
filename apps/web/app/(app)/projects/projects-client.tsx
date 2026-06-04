'use client';

import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import {
  type MappedError,
  deleteProject,
  listProjects,
  mapApiError,
  updateProject,
} from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import { runOptimistic } from '@/lib/query/optimistic';
import type { Project } from '@rytask/contracts';
import { Badge, Button, EmptyState } from '@rytask/ui';
import { Archive, ArchiveRestore, Plus, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

/**
 * Projects list + switcher (US6, T061, FR-WEB-050). Browse every project the principal can see,
 * jump into a project's Board/List/Settings, and (when permitted) create, archive/restore, or
 * delete a project. Archived projects are hidden by default but recoverable behind a toggle.
 * Mutations gate cosmetically on the capability map and reconcile optimistically (D15) — the server
 * stays authoritative. Token-only; loading/empty/error render the shared SurfaceStates.
 */
export function ProjectsClient() {
  const router = useRouter();
  const { can, reason } = useCapabilities();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(mapApiError(e));
      setProjects(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = can('project:create');
  const canAdmin = can('project:admin');

  async function setArchived(project: Project, archived: boolean) {
    setActionError(null);
    const result = await runOptimistic<Project>({
      optimistic: () =>
        setProjects(
          (prev) =>
            prev?.map((p) =>
              p.id === project.id
                ? { ...p, archivedAt: archived ? new Date(0).toISOString() : null }
                : p,
            ) ?? prev,
        ),
      rollback: () =>
        setProjects((prev) => prev?.map((p) => (p.id === project.id ? project : p)) ?? prev),
      commit: () => updateProject(project.id, { archived }),
      onSuccess: (fresh) =>
        setProjects((prev) => prev?.map((p) => (p.id === fresh.id ? fresh : p)) ?? prev),
    });
    if (!result.ok && result.error) setActionError(result.error.message);
  }

  async function remove(project: Project) {
    setActionError(null);
    setConfirmingDelete(null);
    const result = await runOptimistic<void>({
      optimistic: () => setProjects((prev) => prev?.filter((p) => p.id !== project.id) ?? prev),
      rollback: () => void load(),
      commit: () => deleteProject(project.id),
    });
    if (!result.ok && result.error) setActionError(result.error.message);
  }

  if (!projects) {
    return (
      <main style={MAIN}>
        <Header canCreate={canCreate} createReason={reason('project:create')} />
        {error ? (
          <SurfaceFeedback error={error} onRetry={load} />
        ) : (
          <SurfaceLoading label="Loading projects…" />
        )}
      </main>
    );
  }

  const active = projects.filter((p) => !p.archivedAt);
  const archived = projects.filter((p) => p.archivedAt);
  const visible = showArchived ? projects : active;

  return (
    <main style={MAIN}>
      <Header canCreate={canCreate} createReason={reason('project:create')} />

      {actionError ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {actionError}
        </p>
      ) : null}

      {archived.length > 0 ? (
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-3)',
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>
            Show archived ({archived.length})
          </span>
        </label>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={
            canCreate
              ? 'Create your first project to start tracking work.'
              : 'Ask an admin to add you to a project.'
          }
          action={
            canCreate ? (
              <Button
                variant="primary"
                onClick={() => router.push('/projects/new')}
                iconStart={<Plus size={15} aria-hidden="true" />}
              >
                New project
              </Button>
            ) : null
          }
        />
      ) : (
        <ul
          data-testid="projects-list"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          {visible.map((project) => (
            <li
              key={project.id}
              data-testid="project-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                background: 'var(--surface)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Link
                    href={`/projects/${project.id}/board`}
                    style={{ color: 'var(--fg)', fontWeight: 'var(--w-medium)' }}
                  >
                    {project.name}
                  </Link>
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--fg-muted)',
                      fontSize: 'var(--fs-sm)',
                    }}
                  >
                    {project.keyPrefix}
                  </code>
                  {project.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
                </div>
                {project.description ? (
                  <p
                    style={{
                      margin: 'var(--space-1) 0 0',
                      color: 'var(--fg-muted)',
                      fontSize: 'var(--fs-sm)',
                    }}
                  >
                    {project.description}
                  </p>
                ) : null}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  flexShrink: 0,
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/projects/${project.id}/list`)}
                >
                  List
                </Button>
                {canAdmin ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/projects/${project.id}/settings`)}
                      aria-label={`Settings for ${project.name}`}
                      iconStart={<Settings size={15} aria-hidden="true" />}
                    >
                      Settings
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void setArchived(project, !project.archivedAt)}
                      iconStart={
                        project.archivedAt ? (
                          <ArchiveRestore size={15} aria-hidden="true" />
                        ) : (
                          <Archive size={15} aria-hidden="true" />
                        )
                      }
                    >
                      {project.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                    {confirmingDelete === project.id ? (
                      <Button variant="danger" size="sm" onClick={() => void remove(project)}>
                        Confirm delete
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingDelete(project.id)}
                        aria-label={`Delete ${project.name}`}
                        iconStart={<Trash2 size={15} aria-hidden="true" />}
                      >
                        Delete
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Header({ canCreate, createReason }: { canCreate: boolean; createReason: string }) {
  const router = useRouter();
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--space-4)',
      }}
    >
      <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Projects</h1>
      <Button
        variant="primary"
        disabled={!canCreate}
        title={canCreate ? undefined : createReason}
        onClick={() => router.push('/projects/new')}
        iconStart={<Plus size={15} aria-hidden="true" />}
      >
        New project
      </Button>
    </header>
  );
}

const MAIN: React.CSSProperties = { padding: 'var(--space-4)' };
