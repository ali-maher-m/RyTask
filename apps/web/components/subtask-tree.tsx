'use client';

import type { AddSubtask, WorkItem, WorkItemListResponse } from '@rytask/contracts';
import { useCallback, useEffect, useId, useState } from 'react';
import { authedFetch } from '../lib/api';

/**
 * Sub-task tree (US8, T073, FR-WEB-060). A nested, expand/collapse tree of a work item's children
 * with per-node child counts, an inline add-subtask form, and date + start/end range pickers, plus an
 * "Overdue" badge driven by the item's computed `overdue` flag. It nests arbitrarily (≥3 levels), and
 * **prevents cyclic parenting in the UI**: a node never renders one of its own ancestors as a child,
 * so a malformed/looping parent chain can't recurse infinitely (see {@link wouldCreateCycle}).
 *
 * It is a thin client over the REST surface (contracts/openapi.yaml, all under /api/v1):
 *   GET   /work-items/{id}/subtasks   — list a node's direct children (FR-WEB-060)
 *   POST  /work-items/{id}/subtasks   — create a child under a node (project/parent implied)
 *   PATCH /work-items/{id}            — edit a node's start/end/due dates (optimistic `version`)
 *
 * The children GET returns the list envelope `{ data, pageInfo }`; the subtask POST and the date
 * PATCH return the single-resource envelope `{ data }`. Each node lazily loads its own children the
 * first time it is expanded. A stale-version PATCH surfaces a "changed elsewhere" message (409).
 *
 * Token-only styling (semantic `var(--*)`). Accessibility (axe): native <details>/<summary>
 * disclosure, every picker associated with a <label> via a stable useId, and a described overdue badge.
 */

/** The single-resource envelope `{ data }` used by the subtask POST and date PATCH. */
interface DataEnvelope<T> {
  data: T;
}

/** An empty date input maps to clearing the field (PATCH `null`). */
const EMPTY_DATE = '';

/**
 * Whether making `candidateParentId` the parent of `itemId` would create a cycle: it is a cycle when
 * the candidate IS the item (self-parent) or is already one of the item's ancestors/descendants
 * (`relatedIds`). The single guard the tree uses to refuse cyclic parenting in the UI (FR-WEB-060).
 */
export function wouldCreateCycle(
  itemId: string,
  candidateParentId: string,
  relatedIds: readonly string[],
): boolean {
  return candidateParentId === itemId || relatedIds.includes(candidateParentId);
}

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
      <h3 style={{ fontSize: 'var(--fs-h3)' }}>Sub-tasks</h3>
      <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
        <SubtaskNode item={root} depth={0} ancestorIds={[]} onChange={onChange} />
      </ul>
    </section>
  );
}

interface SubtaskNodeProps {
  item: WorkItem;
  depth: number;
  /** Ids of every ancestor on the path to this node — used to refuse cyclic children (FR-WEB-060). */
  ancestorIds: readonly string[];
  onChange?: (item: WorkItem) => void;
}

/**
 * One node of the tree: heading + overdue badge + child count, an expandable region holding the date
 * pickers, the add-subtask form, and (lazily) its own children rendered recursively. A child that is
 * already an ancestor of this node is dropped before render so the tree can never loop.
 */
function SubtaskNode({ item: initial, depth, ancestorIds, onChange }: SubtaskNodeProps) {
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
      const res = await authedFetch(`/work-items/${id}/subtasks`);
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
   * PATCH one date field with the optimistic `version`. On success the server item (with a bumped
   * version) replaces local state; a 409 surfaces a conflict rather than clobbering.
   */
  const patchDate = useCallback(
    async (field: 'startDate' | 'endDate' | 'dueDate', value: string) => {
      const next = value === EMPTY_DATE ? null : value;
      if (next === (item[field] ?? null)) return;
      setBusy(true);
      setError(null);
      setConflict(false);
      try {
        const res = await authedFetch(`/work-items/${item.id}`, {
          method: 'PATCH',
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
   * POST a new direct child (title-only). The project and parent are implied by the path, so the body
   * only carries the title. On success the child is appended and the node's count is bumped locally so
   * the UI reflects the new sub-task without a full reload.
   */
  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload: AddSubtask = { title };
      const res = await authedFetch(`/work-items/${item.id}/subtasks`, {
        method: 'POST',
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
  // The path of ids from the root down to (and including) this node — passed to children so a
  // child that is one of these ancestors is refused (cyclic parenting prevented, FR-WEB-060).
  const pathIds = [...ancestorIds, item.id];
  const safeChildren = children?.filter(
    (child) =>
      !wouldCreateCycle(
        child.id,
        child.id,
        pathIds.filter((id) => id !== child.id),
      ),
  );

  return (
    <li style={{ marginLeft: indent }} data-testid="subtask-node">
      <details open={expanded} onToggle={onToggle}>
        <summary
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
            {item.key}
          </code>
          <span>{item.title}</span>
          {item.overdue ? (
            <span
              data-testid="overdue-badge"
              aria-label={`${item.key} is overdue`}
              style={{
                background: 'var(--error-soft)',
                color: 'var(--error-fg)',
                border: '1px solid var(--error)',
                borderRadius: 'var(--radius-sm)',
                padding: '0 var(--space-2)',
                fontSize: 'var(--fs-micro)',
              }}
            >
              Overdue
            </span>
          ) : null}
          <small style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
            {count} {count === 1 ? 'sub-task' : 'sub-tasks'}
          </small>
        </summary>

        {conflict ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            This item changed elsewhere. Reload to get the latest before editing.
          </p>
        ) : null}
        {error ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        {/* ── Date + start/end range pickers ─────────────────────────────────────── */}
        <fieldset style={FIELDSET}>
          <legend style={LEGEND}>Dates</legend>
          <div style={FIELD}>
            <label htmlFor={startId} style={LABEL}>
              Start date
            </label>
            <input
              id={startId}
              type="date"
              value={item.startDate ?? ''}
              max={item.endDate ?? undefined}
              onChange={(e) => void patchDate('startDate', e.target.value)}
              disabled={busy}
              style={DATE_INPUT}
            />
          </div>
          <div style={FIELD}>
            <label htmlFor={endId} style={LABEL}>
              End date
            </label>
            <input
              id={endId}
              type="date"
              value={item.endDate ?? ''}
              min={item.startDate ?? undefined}
              onChange={(e) => void patchDate('endDate', e.target.value)}
              disabled={busy}
              style={DATE_INPUT}
            />
          </div>
          <div style={FIELD}>
            <label htmlFor={dueId} style={LABEL}>
              Due date
            </label>
            <input
              id={dueId}
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) => void patchDate('dueDate', e.target.value)}
              disabled={busy}
              style={DATE_INPUT}
            />
          </div>
        </fieldset>

        {/* ── Add a direct sub-task ──────────────────────────────────────────────── */}
        <form onSubmit={addSubtask} aria-label={`Add sub-task to ${item.key}`} style={FIELD}>
          <label htmlFor={addId} style={LABEL}>
            Add sub-task
          </label>
          <input
            id={addId}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Sub-task title…"
            disabled={busy}
            style={CONTROL}
          />
          <button type="submit" disabled={busy || !newTitle.trim()} style={ADD_BUTTON}>
            Add
          </button>
        </form>

        {/* ── Children (lazily loaded on expand, rendered recursively) ────────────── */}
        {safeChildren === undefined ? (
          <p>
            <small style={{ color: 'var(--fg-muted)' }}>
              {loaded ? 'No sub-tasks' : 'Expand to load sub-tasks'}
            </small>
          </p>
        ) : safeChildren.length === 0 ? (
          <p>
            <small style={{ color: 'var(--fg-muted)' }}>No sub-tasks</small>
          </p>
        ) : (
          <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
            {safeChildren.map((child) => (
              <SubtaskNode
                key={child.id}
                item={child}
                depth={depth + 1}
                ancestorIds={pathIds}
                onChange={onChange}
              />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

// ── Token-only inline styles ─────────────────────────────────────────────────────────────────
const FIELDSET: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  margin: 'var(--space-2) 0',
  padding: 'var(--space-2) var(--space-3)',
};
const LEGEND: React.CSSProperties = {
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--fg-muted)',
  fontWeight: 'var(--w-medium)',
};
const FIELD: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  marginBottom: 'var(--space-2)',
  flexWrap: 'wrap',
};
const LABEL: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' };
const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
};
const DATE_INPUT: React.CSSProperties = { ...CONTROL, fontFamily: 'var(--font-mono)' };
const ADD_BUTTON: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg-on-accent)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
};
