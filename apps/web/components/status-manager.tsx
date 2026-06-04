'use client';

import {
  type CreateStatus,
  STATUS_CATEGORIES,
  type Status,
  type StatusCategory,
  type UpdateStatus,
} from '@rytask/contracts';
import { Button } from '@rytask/ui';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Project statuses manager (US6, T062, FR-WEB-051). A presentational surface — all data + the
 * server calls are supplied by props, so it is unit-testable without providers (T059). Lets a
 * project admin add a status (name + category + color), rename / recolor / recategorize, reorder
 * (the order drives the board left→right), and delete. **Deleting a populated status requires
 * re-mapping its items first**: the row reveals a "move items to" picker and the delete is blocked
 * until a target status is chosen (mirrors the server's `409`-without-`reassignTo`). Token-only.
 */

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  BACKLOG: 'Backlog',
  UNSTARTED: 'To do',
  STARTED: 'In progress',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
};

export interface StatusManagerProps {
  statuses: Status[];
  /** Item count per status id — drives the "re-map first" gate when deleting. */
  itemCounts: Record<string, number>;
  busy?: boolean;
  canEdit: boolean;
  onCreate: (input: CreateStatus) => void | Promise<void>;
  onUpdate: (id: string, input: UpdateStatus) => void | Promise<void>;
  /** `reassignTo` is the id items are moved to before delete (null only when the status is empty). */
  onDelete: (id: string, reassignTo: string | null) => void | Promise<void>;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
}

export function StatusManager({
  statuses,
  itemCounts,
  busy = false,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: StatusManagerProps) {
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<StatusCategory>('UNSTARTED');
  const [newColor, setNewColor] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');

  function addStatus(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const input: CreateStatus = { name, category: newCategory };
    if (newColor.trim()) input.color = newColor.trim();
    void onCreate(input);
    setNewName('');
    setNewColor('');
  }

  function move(index: number, delta: number) {
    const next = [...statuses];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    void onReorder(next.map((s) => s.id));
  }

  function beginDelete(status: Status) {
    setReassignTo('');
    setDeleting(status.id);
  }

  function confirmDelete(status: Status) {
    const populated = (itemCounts[status.id] ?? 0) > 0;
    // A populated status can only be deleted after its items are re-mapped to another status.
    if (populated && !reassignTo) return;
    void onDelete(status.id, populated ? reassignTo : null);
    setDeleting(null);
    setReassignTo('');
  }

  return (
    <section aria-labelledby="statuses-heading">
      <h2 id="statuses-heading" style={{ fontSize: 'var(--fs-h2)' }}>
        Statuses
      </h2>
      <p style={{ color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
        Columns on the board, left→right. Each maps to a category that drives reporting.
      </p>

      <ul
        data-testid="status-list"
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}
      >
        {statuses.map((status, index) => {
          const count = itemCounts[status.id] ?? 0;
          const others = statuses.filter((s) => s.id !== status.id);
          return (
            <li
              key={status.id}
              data-testid="status-row"
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    type="button"
                    aria-label={`Move ${status.name} up`}
                    disabled={!canEdit || busy || index === 0}
                    onClick={() => move(index, -1)}
                    style={ICON_BTN}
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${status.name} down`}
                    disabled={!canEdit || busy || index === statuses.length - 1}
                    onClick={() => move(index, 1)}
                    style={ICON_BTN}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </span>

                <input
                  aria-label={`Name for ${status.name}`}
                  type="text"
                  defaultValue={status.name}
                  disabled={!canEdit || busy}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== status.name) void onUpdate(status.id, { name: v });
                  }}
                  style={{ ...CONTROL, flex: 1 }}
                />

                <label className="sr-only" htmlFor={`cat-${status.id}`}>
                  Category for {status.name}
                </label>
                <select
                  id={`cat-${status.id}`}
                  value={status.category}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    void onUpdate(status.id, { category: e.target.value as StatusCategory })
                  }
                  style={CONTROL}
                >
                  {STATUS_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>

                <input
                  aria-label={`Color for ${status.name}`}
                  type="text"
                  defaultValue={status.color}
                  placeholder="#RRGGBB"
                  disabled={!canEdit || busy}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== status.color) void onUpdate(status.id, { color: v });
                  }}
                  style={{ ...CONTROL, width: '7rem', fontFamily: 'var(--font-mono)' }}
                />

                <span
                  style={{
                    color: 'var(--fg-muted)',
                    fontSize: 'var(--fs-sm)',
                    fontFamily: 'var(--font-mono)',
                    minWidth: '3.5rem',
                    textAlign: 'right',
                  }}
                >
                  {count} {count === 1 ? 'item' : 'items'}
                </span>

                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${status.name}`}
                    disabled={busy || statuses.length <= 1}
                    onClick={() => beginDelete(status)}
                    iconStart={<Trash2 size={15} aria-hidden="true" />}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>

              {deleting === status.id ? (
                <div
                  data-testid="status-delete-confirm"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {count > 0 ? (
                    <>
                      <label
                        htmlFor={`reassign-${status.id}`}
                        style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}
                      >
                        Move its {count} {count === 1 ? 'item' : 'items'} to
                      </label>
                      <select
                        id={`reassign-${status.id}`}
                        data-testid="reassign-select"
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        style={CONTROL}
                      >
                        <option value="">Choose a status…</option>
                        {others.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>
                      This will permanently remove the status.
                    </span>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || (count > 0 && !reassignTo)}
                    onClick={() => confirmDelete(status)}
                  >
                    Confirm delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(null)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {canEdit ? (
        <form
          onSubmit={addStatus}
          aria-label="Add status"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-3)',
          }}
        >
          <div style={{ flex: 1 }}>
            <label htmlFor="new-status-name" style={LABEL}>
              New status name
            </label>
            <input
              id="new-status-name"
              type="text"
              value={newName}
              disabled={busy}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              style={{ ...CONTROL, width: '100%' }}
            />
          </div>
          <div>
            <label htmlFor="new-status-category" style={LABEL}>
              Category
            </label>
            <select
              id="new-status-category"
              value={newCategory}
              disabled={busy}
              onChange={(e) => setNewCategory(e.target.value as StatusCategory)}
              style={CONTROL}
            >
              {STATUS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="new-status-color" style={LABEL}>
              Color
            </label>
            <input
              id="new-status-color"
              type="text"
              value={newColor}
              placeholder="#RRGGBB"
              disabled={busy}
              onChange={(e) => setNewColor(e.target.value)}
              style={{ ...CONTROL, width: '7rem', fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy || !newName.trim()}>
            Add status
          </Button>
        </form>
      ) : null}
    </section>
  );
}

const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};
const ICON_BTN: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: 'var(--fg-muted)',
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
};
