'use client';

import {
  type ActivityEntry,
  type Label,
  PRIORITIES,
  type Priority,
  type WorkItem,
} from '@rytask/contracts';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Item-detail panel (US2, T044). Shows and edits a single work item: a markdown
 * description editor, single-select controls for priority / assignee / estimate / due date /
 * start+end range, label add/remove, an activity feed, and trash/restore actions.
 *
 * It is a thin client over the US2 REST surface (contracts/openapi.yaml, all under /api/v1):
 *   PATCH  /work-items/{id}                 — field edits, sends the optimistic `version`
 *   DELETE /work-items/{id}                 — trash (soft-delete, FR-WI-008)
 *   POST   /work-items/{id}/restore         — restore from trash
 *   GET    /work-items/{id}/activity        — the per-item history feed (FR-WI-009)
 *   POST   /work-items/{id}/labels          — attach a label (by id)
 *   DELETE /work-items/{id}/labels/{labelId} — detach a label
 *
 * Every PATCH carries the work item's current `version`; a 409 surfaces a "changed elsewhere"
 * message rather than clobbering. Unresolved/optimistic state is never silently dropped.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** The single-resource envelope `{ data, meta? }` used by create/get/update routes. */
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

/** A blank value in a <select> maps to clearing the field (PATCH `null`). */
const NONE_VALUE = '';

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** Human label for an activity entry; falls back to the raw action when unknown. */
function describeActivity(entry: ActivityEntry): string {
  if (entry.field) {
    return `${entry.action} ${entry.field}`;
  }
  return entry.action;
}

export interface ItemDetailProps {
  /** The work item to show/edit. The panel keeps its own draft + version locally. */
  item: WorkItem;
  /** Workspace labels available to attach (GET /labels). Optional — empty if not loaded. */
  labels?: Label[];
  /** Called after any successful mutation with the server's fresh item (e.g. to refresh a board). */
  onChange?: (item: WorkItem) => void;
  /** Called when the user trashes the item (after a 204). */
  onDeleted?: (item: WorkItem) => void;
  /** Close/back affordance for the panel (drawer/modal host wires this). */
  onClose?: () => void;
}

export function ItemDetail({ item, labels = [], onChange, onDeleted, onClose }: ItemDetailProps) {
  const [current, setCurrent] = useState<WorkItem>(item);
  const [description, setDescription] = useState<string>(item.description ?? '');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // Stable ids so every control is programmatically associated with its <label> (axe).
  const descId = useId();
  const priorityId = useId();
  const assigneeId = useId();
  const estimateId = useId();
  const startId = useId();
  const endId = useId();
  const dueId = useId();
  const addLabelId = useId();

  // Re-seed local draft state whenever the host swaps in a different item.
  useEffect(() => {
    setCurrent(item);
    setDescription(item.description ?? '');
    setError(null);
    setConflict(false);
  }, [item]);

  const loadActivity = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/work-items/${id}/activity`);
      if (!res.ok) return;
      const body = (await res.json()) as { data: ActivityEntry[] };
      setActivity(body.data ?? []);
    } catch {
      // The activity feed is non-critical; leave it empty on a transient failure.
    }
  }, []);

  useEffect(() => {
    void loadActivity(item.id);
  }, [item.id, loadActivity]);

  /**
   * PATCH a partial set of fields with the optimistic `version`. On success the server item
   * (with a bumped version) replaces local state and the activity feed is refreshed; a 409 is
   * surfaced as a conflict rather than clobbering. Returns true on success.
   */
  const patch = useCallback(
    async (patchBody: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setConflict(false);
      try {
        const res = await fetch(`${API_BASE}/api/v1/work-items/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
    if (next === (current.description ?? null)) return;
    await patch({ description: next });
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
      const res = await fetch(`${API_BASE}/api/v1/work-items/${current.id}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE}/api/v1/work-items/${current.id}/labels/${labelId}`, {
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
      const res = await fetch(`${API_BASE}/api/v1/work-items/${current.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        setError(`Delete failed (${res.status})`);
        return;
      }
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
      const res = await fetch(`${API_BASE}/api/v1/work-items/${current.id}/restore`, {
        method: 'POST',
      });
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
    <section aria-label={`Work item ${current.key}`} data-testid="item-detail">
      <header>
        <button type="button" onClick={() => onClose?.()} aria-label="Close panel">
          Close
        </button>
        <p>
          <small>{current.key}</small>
        </p>
        <h2>{current.title}</h2>
      </header>

      {conflict ? (
        <p role="alert">This item changed elsewhere. Reload to get the latest before editing.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}

      {/* ── Description (markdown) ─────────────────────────────────────────────── */}
      <div>
        <label htmlFor={descId}>Description (markdown)</label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={6}
          disabled={busy}
          placeholder="Add a description… **markdown** supported"
        />
      </div>

      {/* ── Field controls ─────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor={priorityId}>Priority</label>
        <select
          id={priorityId}
          value={current.priority}
          onChange={(e) => changePriority(e.target.value as Priority)}
          disabled={busy}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={assigneeId}>Assignee</label>
        <input
          id={assigneeId}
          type="text"
          defaultValue={current.assigneeId ?? ''}
          onBlur={(e) => changeAssignee(e.target.value.trim())}
          placeholder="Assignee user id (blank to unassign)"
          disabled={busy}
        />
      </div>

      <div>
        <label htmlFor={estimateId}>Estimate</label>
        <input
          id={estimateId}
          type="number"
          step="any"
          defaultValue={current.estimateValue ?? ''}
          onBlur={(e) => changeEstimate(e.target.value)}
          disabled={busy}
        />
      </div>

      <fieldset>
        <legend>Dates</legend>
        <div>
          <label htmlFor={startId}>Start date</label>
          <input
            id={startId}
            type="date"
            value={current.startDate ?? ''}
            onChange={(e) => changeDate('startDate', e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={endId}>End date</label>
          <input
            id={endId}
            type="date"
            value={current.endDate ?? ''}
            onChange={(e) => changeDate('endDate', e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label htmlFor={dueId}>Due date</label>
          <input
            id={dueId}
            type="date"
            value={current.dueDate ?? ''}
            onChange={(e) => changeDate('dueDate', e.target.value)}
            disabled={busy}
          />
        </div>
      </fieldset>

      {/* ── Labels ─────────────────────────────────────────────────────────────── */}
      <div>
        <h3 id={`${addLabelId}-h`}>Labels</h3>
        <ul aria-labelledby={`${addLabelId}-h`}>
          {attached.length === 0 ? (
            <li>
              <small>No labels</small>
            </li>
          ) : (
            attached.map((id) => {
              const label = labelsById.get(id);
              return (
                <li key={id}>
                  <span>{label ? label.name : id}</span>
                  <button
                    type="button"
                    onClick={() => removeLabel(id)}
                    disabled={busy}
                    aria-label={`Remove label ${label ? label.name : id}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <label htmlFor={addLabelId}>Add label</label>
        <select
          id={addLabelId}
          value={NONE_VALUE}
          onChange={(e) => {
            const v = e.target.value;
            if (v) void addLabel(v);
          }}
          disabled={busy || available.length === 0}
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
      <div>
        <button type="button" onClick={trash} disabled={busy}>
          Move to trash
        </button>
        <button type="button" onClick={restore} disabled={busy}>
          Restore
        </button>
      </div>

      {/* ── Activity feed ──────────────────────────────────────────────────────── */}
      <section aria-label="Activity feed" data-testid="activity-feed">
        <h3>Activity</h3>
        {activity.length === 0 ? (
          <p>
            <small>No activity yet</small>
          </p>
        ) : (
          <ol>
            {activity.map((entry) => (
              <li key={entry.id}>
                <span>{describeActivity(entry)}</span>{' '}
                <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
