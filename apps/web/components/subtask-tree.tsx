'use client';

import type { AddSubtask, WorkItem, WorkItemListResponse } from '@rytask/contracts';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Sub-task tree (US6, T100, FR-HIER-001). A nested, expand/collapse tree of a work item's
 * children with per-node child counts, an inline add-subtask form, date + start/end range
 * pickers, and an "Overdue" badge driven by the item's computed `overdue` flag.
 *
 * It is a thin client over the US6 REST surface (contracts/openapi.yaml, all under /api/v1):
 *   GET   /work-items/{id}/subtasks   — list a node's direct children (FR-HIER-001)
 *   POST  /work-items/{id}/subtasks   — create a child under a node (project/parent implied)
 *   PATCH /work-items/{id}            — edit a node's start/end/due dates (optimistic `version`)
 *
 * The children GET returns the list envelope `{ data, pageInfo }`; the subtask POST and the
 * date PATCH return the single-resource envelope `{ data }`. Each node lazily loads its own
 * children the first time it is expanded, so the tree only fetches what is shown. A stale-
 * version PATCH surfaces a "changed elsewhere" message (409) rather than clobbering.
 *
 * Accessibility (axe): the tree uses native <details>/<summary> disclosure, every picker is
 * associated with a <label> via a stable useId, and the overdue badge carries descriptive text.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** The single-resource envelope `{ data }` used by the subtask POST and date PATCH. */
interface DataEnvelope<T> {
  data: T;
}

/** An empty date input maps to clearing the field (PATCH `null`). */
const EMPTY_DATE = '';

/** Direct child count for a node: prefer the server's `childCount`, fall back to loaded kids. */
function childCountOf(item: WorkItem, loaded: WorkItem[] | undefined): number {
  if (typeof item.childCount === 'number') return item.childCount;
  return loaded?.length ?? 0;
}

export interface SubtaskTreeProps {
  /** The root work item whose sub-tasks are shown. The root itself is rendered as the top node. */
  root: WorkItem;
  /** Called after any successful mutation with the server's fresh item (e.g. to refresh a board). */
  onChange?: (item: WorkItem) => void;
}

export function SubtaskTree({ root, onChange }: SubtaskTreeProps) {
  return (
    <section aria-label={`Sub-tasks of ${root.key}`} data-testid="subtask-tree">
      <h3>Sub-tasks</h3>
      <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
        <SubtaskNode item={root} depth={0} onChange={onChange} />
      </ul>
    </section>
  );
}

interface SubtaskNodeProps {
  item: WorkItem;
  depth: number;
  onChange?: (item: WorkItem) => void;
}

/**
 * One node of the tree: heading + overdue badge + child count, an expandable region holding
 * the date pickers, the add-subtask form, and (lazily) its own children rendered recursively.
 */
function SubtaskNode({ item: initial, depth, onChange }: SubtaskNodeProps) {
  const [item, setItem] = useState<WorkItem>(initial);
  const [children, setChildren] = useState<WorkItem[] | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const startId = useId();
  const endId = useId();
  const dueId = useId();
  const addId = useId();

  // Re-seed local state whenever the host swaps in a different item.
  useEffect(() => {
    setItem(initial);
  }, [initial]);

  const loadChildren = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/work-items/${id}/subtasks`);
      if (!res.ok) {
        setError(`Load sub-tasks failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as WorkItemListResponse;
      setChildren(body.data ?? []);
      setLoaded(true);
    } catch {
      setError('Network error');
    }
  }, []);

  // Lazily load children the first time the node is expanded. Driven by the native <details>
  // `toggle` event so keyboard disclosure (Enter/Space on <summary>) stays fully supported.
  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const open = e.currentTarget.open;
    setExpanded(open);
    if (open && !loaded) void loadChildren(item.id);
  }

  /**
   * PATCH one date field with the optimistic `version`. On success the server item (with a
   * bumped version) replaces local state; a 409 surfaces a conflict rather than clobbering.
   */
  const patchDate = useCallback(
    async (field: 'startDate' | 'endDate' | 'dueDate', value: string) => {
      const next = value === EMPTY_DATE ? null : value;
      if (next === (item[field] ?? null)) return;
      setBusy(true);
      setError(null);
      setConflict(false);
      try {
        const res = await fetch(`${API_BASE}/api/v1/work-items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: item.version, [field]: next }),
        });
        if (res.status === 409) {
          setConflict(true);
          return;
        }
        if (!res.ok) {
          setError(`Update failed (${res.status})`);
          return;
        }
        const body = (await res.json()) as DataEnvelope<WorkItem>;
        setItem(body.data);
        onChange?.(body.data);
      } catch {
        setError('Network error');
      } finally {
        setBusy(false);
      }
    },
    [item, onChange],
  );

  /**
   * POST a new direct child (title-only). The project and parent are implied by the path, so
   * the body only carries the title. On success the child is appended and the node's count is
   * bumped locally so the UI reflects the new sub-task without a full reload.
   */
  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: AddSubtask = { title };
      const res = await fetch(`${API_BASE}/api/v1/work-items/${item.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError(`Add sub-task failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as DataEnvelope<WorkItem>;
      setChildren((prev) => [...(prev ?? []), body.data]);
      setLoaded(true);
      setExpanded(true);
      setItem((prev) => ({
        ...prev,
        childCount: (typeof prev.childCount === 'number' ? prev.childCount : 0) + 1,
      }));
      setNewTitle('');
      onChange?.(body.data);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  const count = childCountOf(item, children);
  // Visual indentation that keeps the semantic list structure intact for screen readers.
  const indent = depth === 0 ? 0 : 16;

  return (
    <li style={{ marginLeft: indent }} data-testid="subtask-node">
      <details open={expanded} onToggle={onToggle}>
        <summary
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <code>{item.key}</code>
          <span>{item.title}</span>
          {item.overdue ? (
            <span
              data-testid="overdue-badge"
              aria-label={`${item.key} is overdue`}
              style={{
                background: '#b3261e',
                color: '#fff',
                borderRadius: 4,
                padding: '0 0.4rem',
                fontSize: '0.75rem',
              }}
            >
              Overdue
            </span>
          ) : null}
          <small style={{ color: '#555' }}>
            {count} {count === 1 ? 'sub-task' : 'sub-tasks'}
          </small>
        </summary>

        {conflict ? (
          <p role="alert">This item changed elsewhere. Reload to get the latest before editing.</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}

        {/* ── Date + start/end range pickers ─────────────────────────────────────── */}
        <fieldset>
          <legend>Dates</legend>
          <div>
            <label htmlFor={startId}>Start date</label>
            <input
              id={startId}
              type="date"
              value={item.startDate ?? ''}
              max={item.endDate ?? undefined}
              onChange={(e) => void patchDate('startDate', e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={endId}>End date</label>
            <input
              id={endId}
              type="date"
              value={item.endDate ?? ''}
              min={item.startDate ?? undefined}
              onChange={(e) => void patchDate('endDate', e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor={dueId}>Due date</label>
            <input
              id={dueId}
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) => void patchDate('dueDate', e.target.value)}
              disabled={busy}
            />
          </div>
        </fieldset>

        {/* ── Add a direct sub-task ──────────────────────────────────────────────── */}
        <form onSubmit={addSubtask} aria-label={`Add sub-task to ${item.key}`}>
          <label htmlFor={addId}>Add sub-task</label>
          <input
            id={addId}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Sub-task title…"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !newTitle.trim()}>
            Add
          </button>
        </form>

        {/* ── Children (lazily loaded on expand, rendered recursively) ────────────── */}
        {children === undefined ? (
          <p>
            <small>{loaded ? 'No sub-tasks' : 'Expand to load sub-tasks'}</small>
          </p>
        ) : children.length === 0 ? (
          <p>
            <small>No sub-tasks</small>
          </p>
        ) : (
          <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
            {children.map((child) => (
              <SubtaskNode key={child.id} item={child} depth={depth + 1} onChange={onChange} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
