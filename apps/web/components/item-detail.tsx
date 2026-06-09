'use client';

import {
  type ActiveTimer,
  type ActivityEntry,
  CAPTURE_SOURCES,
  type CaptureSource,
  type CreateTimeLogInput,
  type Label,
  PRIORITIES,
  type Priority,
  type Status,
  type TimeEntryClass,
  type TimeLog,
  type WorkItem,
} from '@rytask/contracts';
import { Meter } from '@rytask/ui';
import { useCallback, useContext, useEffect, useId, useState } from 'react';
import { authedFetch } from '../lib/api';
import {
  createTimeLog,
  deleteTimeLog,
  getActiveTimer,
  getProjectRollup,
  listTimeLogs,
  startTimer,
  stopTimer,
  updateTimeLog,
} from '../lib/api/time';
import { SessionContext } from '../lib/auth/session-context';
import { recordTrashed } from '../lib/work-items/trash-registry';
import { CommentThread } from './comment-thread';
import { Markdown } from './markdown';
import { SourceBadge } from './work-item/source-badge';

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

/** A live running-timer clock: `1:05:09` with hours, else `5:09` (mono, derived from `startedAt`). */
function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A logged span as plain, friendly time: `2h 15m`, `45m`, `30s` (Albert/Marissa copy). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** A label for where the entry came from (its own source — distinct from the item's capture source). */
const ENTRY_SOURCE_LABELS: Record<TimeLog['source'], string> = {
  TIMER: 'Timer',
  MANUAL: 'Manual',
  SLACK: 'Slack',
  MCP: 'Agent',
  API: 'API',
};

/** Plain, friendly labels for an entry's planned-vs-interruption class (US5, Albert/Marissa copy). */
const ENTRY_CLASS_LABELS: Record<TimeEntryClass, string> = {
  PLANNED: 'Planned',
  INTERRUPTION: 'Interruption',
};

/** A compact, human rendering of an activity value for the old→new summary. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Read a `durationSeconds` off an activity value blob (the TIME_* events carry it), or null. */
function durationFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const d = (value as { durationSeconds?: unknown }).durationSeconds;
  return typeof d === 'number' ? d : null;
}

/**
 * Plain, friendly copy for the M2 time events in the feed (US6, FR-FIN-001 — "started a timer",
 * "logged 2h 15m", "edited a time entry"). Returns null for any non-time action so the generic
 * field-change rendering still applies (Albert/Marissa copy, sentence case).
 */
function describeTimeActivity(entry: ActivityEntry): string | null {
  switch (entry.action) {
    case 'TIME_STARTED':
      return 'started a timer';
    case 'TIME_STOPPED': {
      const d = durationFrom(entry.newValue);
      return d != null ? `stopped the timer — ${formatDuration(d)}` : 'stopped the timer';
    }
    case 'TIME_LOGGED': {
      const d = durationFrom(entry.newValue);
      return d != null ? `logged ${formatDuration(d)}` : 'logged time';
    }
    case 'TIME_EDITED':
      return 'edited a time entry';
    case 'TIME_DELETED': {
      const d = durationFrom(entry.oldValue);
      return d != null ? `deleted a time entry — ${formatDuration(d)}` : 'deleted a time entry';
    }
    default:
      return null;
  }
}

/** Human label for an activity entry: a friendly time line, `changed status: …`, or the raw action. */
function describeActivity(entry: ActivityEntry): string {
  const timeLine = describeTimeActivity(entry);
  if (timeLine) return timeLine;
  if (entry.field) {
    return `${entry.action} ${entry.field}: ${renderValue(entry.oldValue)} → ${renderValue(entry.newValue)}`;
  }
  return entry.action;
}

/**
 * The capture source recorded on a `CREATED` activity entry's `newValue` (capture-source.md §3) —
 * so the history shows where each item came from. Returns null for any other action / shape.
 */
function createdSource(entry: ActivityEntry): CaptureSource | null {
  if (entry.action !== 'CREATED' || !entry.newValue || typeof entry.newValue !== 'object') {
    return null;
  }
  const source = (entry.newValue as { source?: unknown }).source;
  return CAPTURE_SOURCES.includes(source as CaptureSource) ? (source as CaptureSource) : null;
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
  // Time tracking (US1 timer + US2 detail meter). The server is the source of truth: `activeTimer`
  // is re-fetched on load (survives reload/restart) and the live elapsed is derived from `startedAt`.
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [loggedSeconds, setLoggedSeconds] = useState<number | null>(null);
  const [timerBusy, setTimerBusy] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // Manual entries (US3) + the "Add entry" form. `source` is forced MANUAL server-side; the two forms
  // (duration vs start/end) are exclusive — the server validates and the meter/total re-sync on save.
  const [entries, setEntries] = useState<TimeLog[]>([]);
  const [entryMode, setEntryMode] = useState<'duration' | 'range'>('duration');
  const [entryHours, setEntryHours] = useState('');
  const [entryMinutes, setEntryMinutes] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [entryStart, setEntryStart] = useState('');
  const [entryEnd, setEntryEnd] = useState('');
  const [entryNote, setEntryNote] = useState('');
  const [entryBillable, setEntryBillable] = useState(false);
  // Optional planned/interruption override (US5). '' = let the server derive from the item's priority
  // (Urgent ⇒ interruption, else planned); a chosen value is sent and snapshotted as an override.
  const [entryClass, setEntryClass] = useState<'' | TimeEntryClass>('');
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  // Per-entry edit/delete (US4). Owner-or-admin only — a cosmetic mirror of the server's default-deny
  // (the server stays authoritative). The session is read optionally so the panel still renders in
  // isolated tests (no SessionProvider → `null`, controls simply hidden).
  const session = useContext(SessionContext);
  const myUserId = session?.principal?.user.id ?? null;
  const iAmOrgAdmin = session?.principal?.role === 'OWNER' || session?.principal?.role === 'ADMIN';
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryHours, setEditEntryHours] = useState('');
  const [editEntryMinutes, setEditEntryMinutes] = useState('');
  const [editEntryNote, setEditEntryNote] = useState('');
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

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
  const entryHoursId = useId();
  const entryMinutesId = useId();
  const entryDateId = useId();
  const entryStartId = useId();
  const entryEndId = useId();
  const entryNoteId = useId();
  const entryClassId = useId();

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

  /** Re-sync the active timer and this item's logged total (the meter) from the server. */
  const loadTime = useCallback(async (projectId: string, workItemId: string) => {
    try {
      const [active, rollup] = await Promise.all([getActiveTimer(), getProjectRollup(projectId)]);
      setActiveTimer(active);
      const mine = rollup.find((r) => r.workItemId === workItemId);
      setLoggedSeconds(mine ? mine.loggedSeconds : 0);
    } catch {
      // Time data is non-critical; leave the meter/timer as-is on a transient failure.
    }
  }, []);

  useEffect(() => {
    void loadTime(item.projectId, item.id);
  }, [item.projectId, item.id, loadTime]);

  /** Re-sync this item's manual + timer entries (the detail entries list). */
  const loadEntries = useCallback(async (workItemId: string) => {
    try {
      setEntries(await listTimeLogs(workItemId));
    } catch {
      // The entries list is non-critical; leave it as-is on a transient failure.
    }
  }, []);

  useEffect(() => {
    void loadEntries(item.id);
  }, [item.id, loadEntries]);

  // A timer is "running here" only when the caller's single active timer is on THIS item.
  const runningHere = activeTimer?.workItemId === current.id;

  // Tick once a second while running here so the elapsed clock advances (derived, never stored).
  useEffect(() => {
    if (!runningHere) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [runningHere]);

  const elapsedSeconds =
    runningHere && activeTimer
      ? Math.max(0, Math.floor((nowMs - new Date(activeTimer.startedAt).getTime()) / 1000))
      : 0;

  async function onStartTimer() {
    setTimerBusy(true);
    setError(null);
    try {
      // Start switches any other running timer server-side; the returned timer is on this item.
      const t = await startTimer(current.id);
      setActiveTimer(t);
      setNowMs(Date.now());
    } catch {
      setError('Could not start the timer.');
    } finally {
      setTimerBusy(false);
    }
  }

  async function onStopTimer() {
    if (!activeTimer) return;
    setTimerBusy(true);
    setError(null);
    try {
      await stopTimer(activeTimer.id);
      setActiveTimer(null);
      // The stopped span is now a finalized entry — refresh the meter, the entries list, and the feed.
      await loadTime(current.projectId, current.id);
      await loadEntries(current.id);
      void loadActivity(current.id);
    } catch {
      setError('Could not stop the timer.');
    } finally {
      setTimerBusy(false);
    }
  }

  /**
   * Add a manual entry (US3, FR-TT-002). EITHER a duration (hours + minutes, optional date) OR a
   * start/end range — the server forces `source = MANUAL`, validates the form, and the meter/total +
   * entries list + activity feed re-sync on success. A server reject (e.g. end ≤ start) shows its
   * friendly message inline; nothing is persisted.
   */
  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setEntryBusy(true);
    setEntryError(null);
    try {
      let input: CreateTimeLogInput;
      if (entryMode === 'duration') {
        const durationSeconds =
          Math.round(Number(entryHours || '0') * 3600) +
          Math.round(Number(entryMinutes || '0') * 60);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          setEntryError('Enter a duration greater than zero.');
          return;
        }
        input = {
          durationSeconds,
          ...(entryDate ? { date: entryDate } : {}),
          ...(entryNote.trim() ? { note: entryNote.trim() } : {}),
          ...(entryClass ? { classification: entryClass } : {}),
          billable: entryBillable,
        };
      } else {
        if (!entryStart || !entryEnd) {
          setEntryError('Enter both a start and an end time.');
          return;
        }
        input = {
          startedAt: new Date(entryStart).toISOString(),
          endedAt: new Date(entryEnd).toISOString(),
          ...(entryNote.trim() ? { note: entryNote.trim() } : {}),
          ...(entryClass ? { classification: entryClass } : {}),
          billable: entryBillable,
        };
      }
      await createTimeLog(current.id, input);
      // Reset the form, then re-sync everything the new entry touches.
      setEntryHours('');
      setEntryMinutes('');
      setEntryDate('');
      setEntryStart('');
      setEntryEnd('');
      setEntryNote('');
      setEntryBillable(false);
      setEntryClass('');
      await loadEntries(current.id);
      await loadTime(current.projectId, current.id);
      void loadActivity(current.id);
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : 'Could not add the time entry.');
    } finally {
      setEntryBusy(false);
    }
  }

  /** Owner-or-admin may edit/delete an entry — the cosmetic mirror of the server default-deny (US4). */
  function canEditEntry(entry: TimeLog): boolean {
    if (readOnly) return false;
    return iAmOrgAdmin || (entry.userId !== null && entry.userId === myUserId);
  }

  function beginEditEntry(entry: TimeLog) {
    setEditingEntryId(entry.id);
    setEditEntryHours(String(Math.floor(entry.durationSeconds / 3600)));
    setEditEntryMinutes(String(Math.floor((entry.durationSeconds % 3600) / 60)));
    setEditEntryNote(entry.note ?? '');
    setRowError(null);
  }

  /** PATCH /time-logs/{id} — re-derive the duration from hours+minutes; re-sync on success. */
  async function saveEditEntry(entry: TimeLog) {
    const durationSeconds =
      Math.round(Number(editEntryHours || '0') * 3600) +
      Math.round(Number(editEntryMinutes || '0') * 60);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setRowError('Enter a duration greater than zero.');
      return;
    }
    setRowBusy(true);
    setRowError(null);
    try {
      await updateTimeLog(entry.id, {
        durationSeconds,
        note: editEntryNote.trim() ? editEntryNote.trim() : null,
      });
      setEditingEntryId(null);
      await loadEntries(current.id);
      await loadTime(current.projectId, current.id);
      void loadActivity(current.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setRowBusy(false);
    }
  }

  /** DELETE /time-logs/{id} — soft-delete (recoverable server-side); re-sync on success. */
  async function deleteEntry(entry: TimeLog) {
    setRowBusy(true);
    setRowError(null);
    try {
      await deleteTimeLog(entry.id);
      if (editingEntryId === entry.id) setEditingEntryId(null);
      await loadEntries(current.id);
      await loadTime(current.projectId, current.id);
      void loadActivity(current.id);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Could not delete the entry.');
    } finally {
      setRowBusy(false);
    }
  }

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
    // Cyclic-parenting guard (FR-WEB-060): an item can't be its own parent. (A deeper-cycle attempt
    // — choosing a descendant — is also refused by the server with a kind 400.)
    if (next === current.id) {
      setError('An item can’t be its own parent.');
      return;
    }
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
  // The estimate is stored in hours (M1); the meter plots seconds. No estimate ⇒ no over/under.
  const estimateSeconds = current.estimateValue != null ? current.estimateValue * 3600 : null;

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
          <p
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <code
              style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}
              data-testid="item-key"
            >
              {current.key}
            </code>
            <SourceBadge source={current.source} />
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

      {/* ── Time tracking: the live timer (US1) + the plan-vs-actual meter (US2) ── */}
      <div
        data-testid="time-tracking"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-3)',
        }}
      >
        <button
          type="button"
          onClick={runningHere ? onStopTimer : onStartTimer}
          disabled={timerBusy || readOnly}
          aria-label={runningHere ? 'Stop timer' : 'Start timer'}
          data-testid="timer-toggle"
          style={{
            ...CONTROL,
            borderColor: runningHere ? 'var(--time-actual)' : 'var(--border)',
            color: runningHere ? 'var(--time-actual)' : 'var(--fg)',
          }}
        >
          {runningHere ? 'Stop timer' : 'Start timer'}
        </button>
        {runningHere ? (
          <span
            data-testid="timer-elapsed"
            aria-live="polite"
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 'var(--fs-time-lg)',
              color: 'var(--time-actual)',
            }}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
        ) : null}
        <div style={{ flex: 1, minWidth: '180px' }}>
          <Meter
            size="detail"
            showFigures
            loggedSeconds={loggedSeconds ?? 0}
            estimateSeconds={estimateSeconds}
          />
        </div>
      </div>

      {/* ── Time entries: the after-the-fact manual log + the list (US3) ── */}
      <section
        aria-label="Time entries"
        data-testid="time-entries"
        style={{ marginBottom: 'var(--space-4)' }}
      >
        <h3 style={{ fontSize: 'var(--fs-h3)', margin: '0 0 var(--space-2)' }}>Time entries</h3>

        {!readOnly ? (
          <form
            onSubmit={addEntry}
            data-testid="add-time-entry"
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <div
              role="radiogroup"
              aria-label="Entry kind"
              style={{ display: 'flex', gap: 'var(--space-3)' }}
            >
              <label
                style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}
              >
                <input
                  type="radio"
                  name="entry-mode"
                  checked={entryMode === 'duration'}
                  onChange={() => setEntryMode('duration')}
                />
                <span style={LABEL}>Duration</span>
              </label>
              <label
                style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}
              >
                <input
                  type="radio"
                  name="entry-mode"
                  checked={entryMode === 'range'}
                  onChange={() => setEntryMode('range')}
                />
                <span style={LABEL}>Start &amp; end</span>
              </label>
            </div>

            {entryMode === 'duration' ? (
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div style={{ ...FIELD, marginBottom: 0 }}>
                  <label htmlFor={entryHoursId} style={LABEL}>
                    Hours
                  </label>
                  <input
                    id={entryHoursId}
                    type="number"
                    min="0"
                    step="1"
                    value={entryHours}
                    onChange={(ev) => setEntryHours(ev.target.value)}
                    disabled={entryBusy}
                    style={{ ...CONTROL, fontFamily: 'var(--font-mono)', width: '6rem' }}
                  />
                </div>
                <div style={{ ...FIELD, marginBottom: 0 }}>
                  <label htmlFor={entryMinutesId} style={LABEL}>
                    Minutes
                  </label>
                  <input
                    id={entryMinutesId}
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={entryMinutes}
                    onChange={(ev) => setEntryMinutes(ev.target.value)}
                    disabled={entryBusy}
                    style={{ ...CONTROL, fontFamily: 'var(--font-mono)', width: '6rem' }}
                  />
                </div>
                <div style={{ ...FIELD, marginBottom: 0 }}>
                  <label htmlFor={entryDateId} style={LABEL}>
                    Date
                  </label>
                  <input
                    id={entryDateId}
                    type="date"
                    value={entryDate}
                    onChange={(ev) => setEntryDate(ev.target.value)}
                    disabled={entryBusy}
                    style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div style={{ ...FIELD, marginBottom: 0 }}>
                  <label htmlFor={entryStartId} style={LABEL}>
                    Start
                  </label>
                  <input
                    id={entryStartId}
                    type="datetime-local"
                    value={entryStart}
                    onChange={(ev) => setEntryStart(ev.target.value)}
                    disabled={entryBusy}
                    style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                <div style={{ ...FIELD, marginBottom: 0 }}>
                  <label htmlFor={entryEndId} style={LABEL}>
                    End
                  </label>
                  <input
                    id={entryEndId}
                    type="datetime-local"
                    value={entryEnd}
                    onChange={(ev) => setEntryEnd(ev.target.value)}
                    disabled={entryBusy}
                    style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
            )}

            <div style={{ ...FIELD, marginBottom: 0 }}>
              <label htmlFor={entryNoteId} style={LABEL}>
                Note
              </label>
              <input
                id={entryNoteId}
                type="text"
                value={entryNote}
                onChange={(ev) => setEntryNote(ev.target.value)}
                placeholder="What did you work on?"
                disabled={entryBusy}
                style={CONTROL}
              />
            </div>

            <div style={{ ...FIELD, marginBottom: 0 }}>
              <label htmlFor={entryClassId} style={LABEL}>
                Kind
              </label>
              <select
                id={entryClassId}
                value={entryClass}
                onChange={(ev) => setEntryClass(ev.target.value as '' | TimeEntryClass)}
                disabled={entryBusy}
                style={CONTROL}
              >
                <option value="">Auto (from priority)</option>
                <option value="PLANNED">Planned</option>
                <option value="INTERRUPTION">Interruption</option>
              </select>
            </div>

            <label style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={entryBillable}
                onChange={(ev) => setEntryBillable(ev.target.checked)}
                disabled={entryBusy}
              />
              <span style={LABEL}>Billable</span>
            </label>

            {entryError ? (
              <p
                role="alert"
                style={{ color: 'var(--error)', margin: 0, fontSize: 'var(--fs-sm)' }}
              >
                {entryError}
              </p>
            ) : null}

            <div>
              <button type="submit" disabled={entryBusy} style={CONTROL}>
                Add entry
              </button>
            </div>
          </form>
        ) : null}

        {entries.length === 0 ? (
          <p style={{ color: 'var(--fg-faint)', fontSize: 'var(--fs-sm)' }}>No time logged yet</p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                data-testid="time-entry"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                  fontSize: 'var(--fs-sm)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    data-testid="time-entry-duration"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--time-actual)',
                    }}
                  >
                    {formatDuration(entry.durationSeconds)}
                  </span>
                  <time
                    dateTime={entry.startedAt}
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-faint)' }}
                  >
                    {new Date(entry.startedAt).toLocaleDateString()}
                  </time>
                  <span
                    data-testid="time-entry-source"
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '0 var(--space-2)',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    {ENTRY_SOURCE_LABELS[entry.source]}
                  </span>
                  <span
                    data-testid="time-entry-class"
                    title={
                      entry.classificationOverridden ? 'Set manually' : 'From the item’s priority'
                    }
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '0 var(--space-2)',
                      color:
                        entry.classification === 'INTERRUPTION'
                          ? 'var(--time-over)'
                          : 'var(--fg-muted)',
                    }}
                  >
                    {ENTRY_CLASS_LABELS[entry.classification]}
                  </span>
                  {entry.note ? <span style={{ color: 'var(--fg)' }}>{entry.note}</span> : null}
                  {entry.billable ? (
                    <span style={{ color: 'var(--fg-muted)' }}>· Billable</span>
                  ) : null}
                  {canEditEntry(entry) ? (
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-1)' }}>
                      <button
                        type="button"
                        onClick={() => beginEditEntry(entry)}
                        disabled={rowBusy}
                        aria-label={`Edit time entry ${formatDuration(entry.durationSeconds)}`}
                        style={{ ...CONTROL, padding: 'var(--space-1) var(--space-2)' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEntry(entry)}
                        disabled={rowBusy}
                        aria-label={`Delete time entry ${formatDuration(entry.durationSeconds)}`}
                        style={{
                          ...CONTROL,
                          padding: 'var(--space-1) var(--space-2)',
                          color: 'var(--error)',
                          borderColor: 'var(--error)',
                        }}
                      >
                        Delete
                      </button>
                    </span>
                  ) : null}
                </div>

                {editingEntryId === entry.id ? (
                  <div
                    data-testid="edit-time-entry"
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      flexWrap: 'wrap',
                      alignItems: 'flex-end',
                      padding: 'var(--space-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <label
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
                    >
                      <span style={LABEL}>Hours</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editEntryHours}
                        onChange={(ev) => setEditEntryHours(ev.target.value)}
                        disabled={rowBusy}
                        aria-label="Edit hours"
                        style={{ ...CONTROL, fontFamily: 'var(--font-mono)', width: '5rem' }}
                      />
                    </label>
                    <label
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
                    >
                      <span style={LABEL}>Minutes</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        value={editEntryMinutes}
                        onChange={(ev) => setEditEntryMinutes(ev.target.value)}
                        disabled={rowBusy}
                        aria-label="Edit minutes"
                        style={{ ...CONTROL, fontFamily: 'var(--font-mono)', width: '5rem' }}
                      />
                    </label>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-1)',
                        flex: 1,
                      }}
                    >
                      <span style={LABEL}>Note</span>
                      <input
                        type="text"
                        value={editEntryNote}
                        onChange={(ev) => setEditEntryNote(ev.target.value)}
                        disabled={rowBusy}
                        aria-label="Edit note"
                        style={CONTROL}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => saveEditEntry(entry)}
                      disabled={rowBusy}
                      style={CONTROL}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingEntryId(null)}
                      disabled={rowBusy}
                      style={CONTROL}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {rowError && editingEntryId === entry.id ? (
                  <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
                    {rowError}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

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
            max={current.endDate ?? undefined}
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
            min={current.startDate ?? undefined}
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
            {activity.map((entry) => {
              const source = createdSource(entry);
              return (
                <li
                  key={entry.id}
                  data-testid="activity-entry"
                  style={{ fontSize: 'var(--fs-sm)' }}
                >
                  <span>{describeActivity(entry)}</span>{' '}
                  {source ? <SourceBadge source={source} /> : null}{' '}
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
              );
            })}
          </ol>
        )}
      </section>

      {/* ── Comments (US10) ───────────────────────────────────────────────────── */}
      <CommentThread workItemId={current.id} />
    </section>
  );
}
