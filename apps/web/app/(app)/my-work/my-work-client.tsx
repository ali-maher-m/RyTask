'use client';

import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { type MappedError, listProjects, listWorkItemsPage, mapApiError } from '@/lib/api';
import { getTimeSummary } from '@/lib/api/time';
import { SessionContext } from '@/lib/auth/session-context';
import { useOrg } from '@/lib/org/org-context';
import type { Project, WorkItem } from '@rytask/contracts';
import { Button, EmptyState, Figure } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useContext, useEffect, useState } from 'react';

/**
 * "My Work" cross-project hub (US6, T064, FR-WEB-053). Reads `GET /work-items?smart=my-work` — the
 * items assigned to the current user across every project they can access — and lists each with its
 * project, key, title, priority, status-agnostic due date, and an overdue flag. The keyset cursor
 * powers "Load more" (no OFFSET, SC-011). Dates render in the org timezone/locale (FR-WEB-004);
 * figures use the Geist Mono tabular face. Loading / empty / error use the shared SurfaceStates.
 */

interface MyWorkState {
  items: WorkItem[];
  projectsById: Map<string, Project>;
  nextCursor: string | null;
}

/** "My time" totals (US7) — today, this week, and the planned/interruption split for the week. */
interface MyTime {
  todaySeconds: number;
  weekSeconds: number;
  plannedSeconds: number;
  interruptionSeconds: number;
}

/** ISO `YYYY-MM-DD` for a date `daysAgo` before today (UTC — aligns with the server day buckets). */
function isoDay(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** A logged span as plain, friendly time: `2h 15m`, `45m`, `0m` (Albert/Marissa copy). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export function MyWorkClient() {
  const { formatDay } = useOrg();
  const session = useContext(SessionContext);
  const myUserId = session?.principal?.user.id ?? null;
  const [state, setState] = useState<MyWorkState | null>(null);
  const [myTime, setMyTime] = useState<MyTime | null>(null);
  const [error, setError] = useState<MappedError | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFirst = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const [projects, page] = await Promise.all([
        listProjects(),
        listWorkItemsPage({ smart: 'my-work' }),
      ]);
      const projectsById = new Map(projects.map((p) => [p.id, p]));
      setState({ items: page.items, projectsById, nextCursor: page.nextCursor });
    } catch (e) {
      setError(mapApiError(e));
      setState(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  /**
   * Load "my time today / this week" (US7, web-surfaces.md §5). One per-day query over this week
   * scoped to the current user; today's figure is the row for today, the week figure is the sum, and
   * the planned/interruption split sums the buckets. The server is authoritative — these are pure SUMs.
   */
  const loadMyTime = useCallback(async () => {
    if (!myUserId) return;
    try {
      const today = isoDay(0);
      const rows = await getTimeSummary({
        groupBy: 'period',
        period: 'day',
        userId: myUserId,
        from: isoDay(6),
        to: today,
      });
      const weekSeconds = rows.reduce((sum, r) => sum + r.loggedSeconds, 0);
      const plannedSeconds = rows.reduce((sum, r) => sum + r.plannedSeconds, 0);
      const interruptionSeconds = rows.reduce((sum, r) => sum + r.interruptionSeconds, 0);
      const todaySeconds = rows.find((r) => r.key === today)?.loggedSeconds ?? 0;
      setMyTime({ todaySeconds, weekSeconds, plannedSeconds, interruptionSeconds });
    } catch {
      // The "my time" summary is non-critical; leave it hidden on a transient failure.
    }
  }, [myUserId]);

  useEffect(() => {
    void loadMyTime();
  }, [loadMyTime]);

  const loadMore = useCallback(async () => {
    if (!state?.nextCursor || busy) return;
    setBusy(true);
    try {
      const page = await listWorkItemsPage({ smart: 'my-work' }, state.nextCursor);
      setState((prev) =>
        prev
          ? { ...prev, items: [...prev.items, ...page.items], nextCursor: page.nextCursor }
          : prev,
      );
    } catch (e) {
      setError(mapApiError(e));
    } finally {
      setBusy(false);
    }
  }, [state, busy]);

  if (!state) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>My Work</h1>
        {error ? (
          <SurfaceFeedback error={error} onRetry={loadFirst} />
        ) : (
          <SurfaceLoading label="Loading your work…" />
        )}
      </main>
    );
  }

  const projectLabel = (projectId: string) => {
    const project = state.projectsById.get(projectId);
    return project ? project.name : projectId;
  };

  return (
    <main style={MAIN}>
      <h1 style={{ fontSize: 'var(--fs-h1)' }}>My Work</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        Everything assigned to you, across every project you can access.
      </p>

      {myTime ? (
        <section
          data-testid="my-time"
          aria-label="My time"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            margin: 'var(--space-2) 0 var(--space-3)',
            color: 'var(--fg-muted)',
          }}
        >
          <span style={{ fontWeight: 'var(--w-medium)', color: 'var(--fg)' }}>My time</span>
          <span>
            Today:{' '}
            <Figure title="Time you logged today">{formatDuration(myTime.todaySeconds)}</Figure>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            This week:{' '}
            <Figure title="Time you logged in the last 7 days">
              {formatDuration(myTime.weekSeconds)}
            </Figure>
          </span>
          {myTime.weekSeconds > 0 ? (
            <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-faint)' }}>
              (<Figure>{formatDuration(myTime.plannedSeconds)}</Figure> planned ·{' '}
              <Figure>{formatDuration(myTime.interruptionSeconds)}</Figure> interruptions)
            </span>
          ) : null}
          {/* M4 — a quiet link to the personal weekly summary (web-surfaces §1). */}
          <Link
            href="/reports/week"
            style={{ fontSize: 'var(--fs-sm)', color: 'var(--accent-fg)' }}
          >
            My week →
          </Link>
        </section>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error.message}
        </p>
      ) : null}

      {state.items.length === 0 ? (
        <EmptyState
          title="Nothing assigned to you right now"
          description="Items assigned to you across your projects will show up here."
        />
      ) : (
        <table data-testid="my-work-list" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="sr-only">Work items assigned to you</caption>
          <thead>
            <tr>
              {['Project', 'Key', 'Title', 'Priority', 'Due'].map((h) => (
                <th key={h} scope="col" style={HEAD}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr
                key={item.id}
                data-testid="my-work-row"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <td style={CELL}>{projectLabel(item.projectId)}</td>
                <td style={CELL}>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                    {item.key}
                  </code>
                </td>
                <td style={CELL}>
                  <Link
                    href={`/projects/${item.projectId}/items/${item.key}`}
                    aria-label={`Open ${item.key} ${item.title}`}
                    style={{ color: 'var(--fg)' }}
                  >
                    {item.title}
                  </Link>
                </td>
                <td style={CELL}>{item.priority === 'NONE' ? '—' : item.priority}</td>
                <td style={{ ...CELL, fontFamily: 'var(--font-mono)' }}>
                  {item.dueDate ? (
                    <span style={item.overdue ? { color: 'var(--error)' } : undefined}>
                      {formatDay(item.dueDate)}
                      {item.overdue ? ' · overdue' : ''}
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
        <p style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={() => void loadMore()} loading={busy}>
            Load more
          </Button>
        </p>
      ) : null}
    </main>
  );
}

const MAIN: React.CSSProperties = { padding: 'var(--space-4)' };
const CELL: React.CSSProperties = {
  padding: 'var(--space-2)',
  textAlign: 'left',
  verticalAlign: 'middle',
};
const HEAD: React.CSSProperties = {
  ...CELL,
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--fg-muted)',
  fontWeight: 'var(--w-medium)',
};
