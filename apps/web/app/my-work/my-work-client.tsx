'use client';

import type { Project, WorkItem } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, listAllProjects, listMyWork } from './api-client';

/**
 * "My Work" cross-project view (US4, T075, FR-PROJ-006). Reads
 * `GET /api/v1/work-items?smart=my-work` — the items assigned to the current user across every
 * project they can access (cursor-paginated). Each row links into the owning project's list view
 * and shows the project (resolved from `GET /projects`), key, title, priority, status, and due
 * date. "Load more" advances the keyset cursor (no OFFSET, SC-011). The table is labelled and
 * every interactive control has an accessible name for axe.
 */

interface MyWorkState {
  items: WorkItem[];
  projectsById: Map<string, Project>;
  nextCursor: string | null;
}

export function MyWorkClient() {
  const [state, setState] = useState<MyWorkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFirst = useCallback(async () => {
    try {
      setBusy(true);
      const [projects, page] = await Promise.all([listAllProjects(), listMyWork()]);
      const projectsById = new Map(projects.map((p) => [p.id, p]));
      setState({ items: page.items, projectsById, nextCursor: page.nextCursor });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load My Work');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!state?.nextCursor || busy) return;
    try {
      setBusy(true);
      const page = await listMyWork(state.nextCursor);
      setState((prev) =>
        prev
          ? { ...prev, items: [...prev.items, ...page.items], nextCursor: page.nextCursor }
          : prev,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load more');
    } finally {
      setBusy(false);
    }
  }, [state, busy]);

  if (error && !state) {
    return (
      <main>
        <h1>My Work</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main>
        <h1>My Work</h1>
        <p>Loading your work…</p>
      </main>
    );
  }

  const projectLabel = (projectId: string) => {
    const project = state.projectsById.get(projectId);
    return project ? `${project.icon ? `${project.icon} ` : ''}${project.name}` : projectId;
  };

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>My Work</h1>
        <nav>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <p>Everything assigned to you, across every project you can access.</p>

      {error ? <p role="alert">{error}</p> : null}

      {state.items.length === 0 ? (
        <p data-testid="my-work-empty">Nothing assigned to you right now.</p>
      ) : (
        <table data-testid="my-work-list" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption>Work items assigned to you</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Key</th>
              <th scope="col">Title</th>
              <th scope="col">Priority</th>
              <th scope="col">Due</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr
                key={item.id}
                data-testid="my-work-row"
                style={{ borderTop: '1px solid #e3e5e8' }}
              >
                <td>{projectLabel(item.projectId)}</td>
                <td>
                  <code>{item.key}</code>
                </td>
                <td>
                  <Link
                    href={`/projects/${item.projectId}/list`}
                    aria-label={`Open ${item.key} ${item.title}`}
                  >
                    {item.title}
                  </Link>
                </td>
                <td>{item.priority}</td>
                <td>
                  {item.dueDate ? (
                    <span style={item.overdue ? { color: '#b00020' } : undefined}>
                      {item.dueDate}
                      {item.overdue ? ' (overdue)' : ''}
                    </span>
                  ) : (
                    <span aria-label="No due date">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {state.nextCursor ? (
        <p>
          <button type="button" onClick={() => void loadMore()} disabled={busy}>
            {busy ? 'Loading…' : 'Load more'}
          </button>
        </p>
      ) : null}
    </main>
  );
}
