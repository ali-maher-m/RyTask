'use client';

import {
  type ActivityEntry,
  type Label,
  PRIORITIES,
  type Priority,
  type Status,
  type WorkItem,
} from '@rytask/contracts';
import { useCallback, useEffect, useId, useState } from 'react';
import { authedFetch } from '../lib/api';
import { recordTrashed } from '../lib/work-items/trash-registry';
import { Markdown } from './markdown';

/**
 * Item-detail surface (US3, T046, FR-WEB-022/023, D15). Shows and edits every field of one work
 * item — title, a **markdown** description (rendered, with persisted task-list toggles), status,
 * priority, assignee, estimate, due date, a separate start→end range, parent, and labels — plus a
 * per-item **activity** feed (field, old→new, actor, time) and **trash / restore**.
 *
 * It is a thin client over the M1 REST surface (all under /api/v1):
 *   PATCH  /work-items/{id}                  — field edits; sends the optimistic `version`
 *   DELETE /work-items/{id}                  — trash (soft-delete, FR-WEB-023)
 *   POST   /work-items/{id}/restore          — restore from trash
 *   GET    /work-items/{id}/activity         — the per-item history feed
 *   POST   /work-items/{id}/labels           — attach a label (by id)
 *   DELETE /work-items/{id}/labels/{labelId} — detach a label
 *
 * Every PATCH carries the item's current `version`; a 409 surfaces a kind "changed elsewhere" message
 * (offering a refresh) instead of clobbering — optimistic where safe, never a silent divergence (D15).
 * Token-only styling (semantic `var(--*)`), every control programmatically labelled (axe).
 */

interface DataEnvelope<T> {
  data: T;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'No priority',
};

/** A blank value in a <select>/<input> clears the field (PATCH `null`). */
const NONE_VALUE = '';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** A compact, human rendering of an activity value for the old→new summary. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Human label for an activity entry: `changed status: Todo → In Progress`, or the raw action. */
function describeActivity(entry: ActivityEntry): string {
  if (entry.field) {
    return `${entry.action} ${entry.field}: ${renderValue(entry.oldValue)} → ${renderValue(entry.newValue)}`;
  }
  return entry.action;
}

const FIELD: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-3)',
};
const LABEL: React.CSSProperties = {
  fontSize: 'var(--fs-sm)',
  fontWeight: 'var(--w-medium)',
  color: 'var(--fg-muted)',
};
const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};

export interface ItemDetailProps {
  /** The work item to show/edit. The panel keeps its own draft + version locally. */
  item: WorkItem;
  /** Project statuses (the status select). Optional — the control hides when not supplied. */
  statuses?: Status[];
  /** Workspace labels available to attach (GET /labels). Optional — empty if not loaded. */
  labels?: Label[];
  /**
   * Cosmetic edit gate (US5, FR-WEB-100). When `false`, every mutating control is disabled and a
   * read-only notice explains why — the server stays authoritative, so a slipped-through write
   * still reconciles. Defaults to `true` so hosts that don't gate keep full editing.
   */
  canEdit?: boolean;
  /** Plain-language reason shown when `canEdit` is false (from the capability map). */
  editReason?: string;
  /** Called after any successful mutation with the server's fresh item (e.g. to refresh a board). */
  onChange?: (item: WorkItem) => void;
  /** Called when the user trashes the item (after a 204). */
  onDeleted?: (item: WorkItem) => void;
  /** Close/back affordance for the panel (drawer/page host wires this). */
  onClose?: () => void;
}

export function ItemDetail({
  item,
  statuses = [],
  labels = [],
  canEdit = true,
  editReason = 'You have read-only access to this item. Ask a project admin to make changes.',
  onChange,
  onDeleted,
  onClose,
}: ItemDetailProps) {
  const readOnly = !canEdit;
  // Disable every editing control while a request is in flight OR the role can't write here.
  const locked = (busyState: boolean) => busyState || readOnly;
  const [current, setCurrent] = useState<WorkItem>(item);
  const [description, setDescription] = useState<string>(item.description ?? '');
  const [editingDescription, setEditingDescription] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // Stable ids so every control is associated with its <label> (axe).
  const descId = useId();
  const statusId = useId();
  const priorityId = useId();
  const assigneeId = useId();
  const parentId = useId();
  const estimateId = useId();
  const startId = useId();
  const endId = useId();
  const dueId = useId();
  const addLabelId = useId();

  // Re-seed local draft whenever the host swaps in a different item.
  useEffect(() => {
    setCurrent(item);
    setDescription(item.description ?? '');
    setEditingDescription(false);
    setError(null);
    setConflict(false);
  }, [item]);

  const loadActivity = useCallback(async (id: string) => {
    try {
      const res = await authedFetch(`/work-items/${id}/activity`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: ActivityEntry[] };
      setActivity(body.data ?? []);
    } catch {
      // The activity feed is non-critical; leave it as-is on a transient failure.
    }
  }, []);

  useEffect(() => {
    void loadActivity(item.id);
  }, [item.id, loadActivity]);

  /**
   * PATCH a partial set of fields with the optimistic `version`. On success the server item (bumped
   * version) replaces local state and the activity feed refreshes; a 409 surfaces a kind conflict.
   * Returns true on success.
   */
  const patch = useCallback(
    async (patchBody: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setConflict(false);
      try {
        const res = await authedFetch(`/work-items/${current.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: current.version, ...patchBody }),
        });
        if (res.status === 409) {
          setConflict(true);
          return false;
        }
        if (!res.ok) {
          setError(`Update failed (${res.status})`);
          return false;
        }
        const body = (await res.json()) as DataEnvelope<WorkItem>;
        setCurrent(body.data);
        setDescription(body.data.description ?? '');
        onChange?.(body.data);
        void loadActivity(body.data.id);
        return true;
      } catch {
        setError('Network error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [current.id, current.version, onChange, loadActivity],
  );

  async function saveDescription() {
    const next = description.trim() === '' ? null : description;
    if (next === (current.description ?? null)) {
      setEditingDescription(false);
      return;
    }
    if (await patch({ description: next })) setEditingDescription(false);
  }

  /** A persisted task-list toggle from the rendered markdown: rewrite + save the description. */
  async function toggleTask(nextSource: string) {
    setDescription(nextSource);
    await patch({ description: nextSource === '' ? null : nextSource });
  }

  async function changeStatus(value: string) {
    if (!value || value === current.statusId) return;
    await patch({ statusId: value });
  }

  async function changePriority(value: Priority) {
    if (value === current.priority) return;
    await patch({ priority: value });
  }

  async function changeAssignee(value: string) {
    const next = value === NONE_VALUE ? null : value;
    if (next === (current.assigneeId ?? null)) return;
    await patch({ assigneeId: next });
  }

  async function changeParent(value: string) {
    const next = value === NONE_VALUE ? null : value;
    if (next === (current.parentId ?? null)) return;
    await patch({ parentId: next });
  }

  async function changeDate(field: 'startDate' | 'endDate' | 'dueDate', value: string) {
    const next = value === '' ? null : value;
    if (next === (current[field] ?? null)) return;
    await patch({ [field]: next });
  }

  async function changeEstimate(value: string) {
    const next = value === '' ? null : Number(value);
    if (next !== null && Number.isNaN(next)) return;
    if (next === (current.estimateValue ?? null)) return;
    await patch({ estimateValue: next });
  }

  async function addLabel(labelId: string) {
    if (!labelId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/work-items/${current.id}/labels`, {
        method: 'POST',
        body: JSON.stringify({ labelId }),
      });
      if (!res.ok) {
        setError(`Add label failed (${res.status})`);
        return;
      }
      const next = [...(current.labelIds ?? []), labelId];
      const updated = { ...current, labelIds: next };
      setCurrent(updated);
      onChange?.(updated);
      void loadActivity(current.id);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function removeLabel(labelId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/work-items/${current.id}/labels/${labelId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        setError(`Remove label failed (${res.status})`);
        return;
      }
      const next = (current.labelIds ?? []).filter((id) => id !== labelId);
      const updated = { ...current, labelIds: next };
      setCurrent(updated);
      onChange?.(updated);
      void loadActivity(current.id);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/work-items/${current.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        setError(`Delete failed (${res.status})`);
        return;
      }
      // No server lists trashed items, so remember this one for the project's Trash page.
      recordTrashed(current);
      onDeleted?.(current);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/work-items/${current.id}/restore`, { method: 'POST' });
      if (!res.ok) {
        setError(`Restore failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as DataEnvelope<WorkItem>;
      setCurrent(body.data);
      onChange?.(body.data);
      void loadActivity(body.data.id);
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  const labelsById = new Map(labels.map((l) => [l.id, l]));
  const attached = current.labelIds ?? [];
  const available = labels.filter((l) => !attached.includes(l.id));

  return (
    <section
      aria-label={`Work item ${current.key}`}
      data-testid="item-detail"
      style={{ color: 'var(--fg)' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div>
          <p style={{ margin: 0 }}>
            <code
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}
              data-testid="item-key"
            >
              {current.key}
            </code>
          </p>
          <h2 style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--fs-h2)' }}>
            {current.title}
          </h2>
        </div>
        {onClose ? (
          <button type="button" onClick={() => onClose()} aria-label="Close panel" style={CONTROL}>
            Close
          </button>
        ) : null}
      </header>

      {readOnly ? (
        <p
          data-testid="item-readonly-notice"
          style={{
            color: 'var(--fg-muted)',
            fontSize: 'var(--fs-sm)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-2) var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          {editReason}
        </p>
      ) : null}
      {conflict ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          This item changed elsewhere. Refresh to get the latest before editing.
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}

      {/* ── Description (markdown) ─────────────────────────────────────────────── */}
      <div style={FIELD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span id={`${descId}-label`} style={LABEL}>
            Description
          </span>
          <button
            type="button"
            onClick={() => setEditingDescription((v) => !v)}
            aria-pressed={editingDescription}
            disabled={readOnly}
            style={{ ...CONTROL, padding: 'var(--space-1) var(--space-2)' }}
          >
            {editingDescription ? 'Preview' : 'Edit'}
          </button>
        </div>
        {editingDescription || description.trim() === '' ? (
          <textarea
            id={descId}
            aria-labelledby={`${descId}-label`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            rows={6}
            disabled={locked(busy)}
            placeholder="Add a description… **markdown** supported (incl. - [ ] task lists)"
            style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
          />
        ) : (
          <div
            aria-labelledby={`${descId}-label`}
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              background: 'var(--surface)',
            }}
          >
            <Markdown source={description} onToggleTask={toggleTask} />
          </div>
        )}
      </div>

      {/* ── Field controls ─────────────────────────────────────────────────────── */}
      {statuses.length > 0 ? (
        <div style={FIELD}>
          <label htmlFor={statusId} style={LABEL}>
            Status
          </label>
          <select
            id={statusId}
            value={current.statusId}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={locked(busy)}
            style={CONTROL}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={FIELD}>
        <label htmlFor={priorityId} style={LABEL}>
          Priority
        </label>
        <select
          id={priorityId}
          value={current.priority}
          onChange={(e) => changePriority(e.target.value as Priority)}
          disabled={locked(busy)}
          style={CONTROL}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label htmlFor={assigneeId} style={LABEL}>
          Assignee
        </label>
        <input
          id={assigneeId}
          type="text"
          defaultValue={current.assigneeId ?? ''}
          onBlur={(e) => changeAssignee(e.target.value.trim())}
          placeholder="Assignee user id (blank to unassign)"
          disabled={locked(busy)}
          style={CONTROL}
        />
      </div>

      <div style={FIELD}>
        <label htmlFor={parentId} style={LABEL}>
          Parent
        </label>
        <input
          id={parentId}
          type="text"
          defaultValue={current.parentId ?? ''}
          onBlur={(e) => changeParent(e.target.value.trim())}
          placeholder="Parent work item id (blank for none)"
          disabled={locked(busy)}
          style={CONTROL}
        />
      </div>

      <div style={FIELD}>
        <label htmlFor={estimateId} style={LABEL}>
          Estimate
        </label>
        <input
          id={estimateId}
          type="number"
          step="any"
          defaultValue={current.estimateValue ?? ''}
          onBlur={(e) => changeEstimate(e.target.value)}
          disabled={locked(busy)}
          style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
        />
      </div>

      <fieldset
        style={{
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          margin: '0 0 var(--space-3)',
          padding: 'var(--space-3)',
        }}
      >
        <legend style={LABEL}>Dates</legend>
        <div style={FIELD}>
          <label htmlFor={startId} style={LABEL}>
            Start date
          </label>
          <input
            id={startId}
            type="date"
            value={current.startDate ?? ''}
            onChange={(e) => changeDate('startDate', e.target.value)}
            disabled={locked(busy)}
            style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div style={FIELD}>
          <label htmlFor={endId} style={LABEL}>
            End date
          </label>
          <input
            id={endId}
            type="date"
            value={current.endDate ?? ''}
            onChange={(e) => changeDate('endDate', e.target.value)}
            disabled={locked(busy)}
            style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
          />
        </div>
        <div style={{ ...FIELD, marginBottom: 0 }}>
          <label htmlFor={dueId} style={LABEL}>
            Due date
          </label>
          <input
            id={dueId}
            type="date"
            value={current.dueDate ?? ''}
            onChange={(e) => changeDate('dueDate', e.target.value)}
            disabled={locked(busy)}
            style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </fieldset>

      {/* ── Labels ─────────────────────────────────────────────────────────────── */}
      <div style={FIELD}>
        <h3 id={`${addLabelId}-h`} style={{ ...LABEL, margin: 0 }}>
          Labels
        </h3>
        <ul
          aria-labelledby={`${addLabelId}-h`}
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          {attached.length === 0 ? (
            <li style={{ color: 'var(--fg-faint)', fontSize: 'var(--fs-sm)' }}>No labels</li>
          ) : (
            attached.map((id) => {
              const label = labelsById.get(id);
              return (
                <li
                  key={id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-pill)',
                    padding: '0 var(--space-2)',
                  }}
                >
                  <span>{label ? label.name : id}</span>
                  <button
                    type="button"
                    onClick={() => removeLabel(id)}
                    disabled={locked(busy)}
                    aria-label={`Remove label ${label ? label.name : id}`}
                    style={{ ...CONTROL, border: 0, background: 'transparent', padding: 0 }}
                  >
                    Remove
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <label htmlFor={addLabelId} style={LABEL}>
          Add label
        </label>
        <select
          id={addLabelId}
          value={NONE_VALUE}
          onChange={(e) => {
            const v = e.target.value;
            if (v) void addLabel(v);
          }}
          disabled={locked(busy) || available.length === 0}
          style={CONTROL}
        >
          <option value={NONE_VALUE}>Choose a label…</option>
          {available.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Trash / restore ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          onClick={trash}
          disabled={locked(busy)}
          style={{ ...CONTROL, color: 'var(--error)', borderColor: 'var(--error)' }}
        >
          Move to trash
        </button>
        <button type="button" onClick={restore} disabled={locked(busy)} style={CONTROL}>
          Restore
        </button>
      </div>

      {/* ── Activity feed ──────────────────────────────────────────────────────── */}
      <section aria-label="Activity feed" data-testid="activity-feed">
        <h3 style={{ fontSize: 'var(--fs-h3)' }}>Activity</h3>
        {activity.length === 0 ? (
          <p style={{ color: 'var(--fg-faint)', fontSize: 'var(--fs-sm)' }}>No activity yet</p>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {activity.map((entry) => (
              <li key={entry.id} data-testid="activity-entry" style={{ fontSize: 'var(--fs-sm)' }}>
                <span>{describeActivity(entry)}</span>{' '}
                {entry.actorId ? (
                  <span style={{ color: 'var(--fg-muted)' }}>by {entry.actorId}</span>
                ) : null}{' '}
                <time
                  dateTime={entry.createdAt}
                  style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-faint)' }}
                >
                  {formatTimestamp(entry.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
