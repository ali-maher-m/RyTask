'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Status, WorkItem } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createWorkItem,
  listAllWorkItems,
  listStatuses,
  moveWorkItem,
} from '../api-client';
import { WorkItemDetail } from '../work-item-detail';

/**
 * Kanban Board (US3, T060, FR-VIEW-001). Reads `GET /api/v1/work-items` (flat keyset page,
 * grouped by status client-side) + `GET /projects/{id}/statuses` for the ordered columns.
 * Dragging a card to another column (or to a new slot) calls `POST /work-items/{id}/move`
 * with the new `statusId` + neighbour anchors (`afterId`/`beforeId`); the BACKEND computes
 * the fractional position. After a successful move we re-read from the server so the order
 * and status survive a reload (the flagship e2e asserts this). Built on `@dnd-kit`, keyboard
 * + pointer accessible for axe.
 */

/** Items in a column, ordered by fractional `position` (nulls last, then by `number`). */
function ordered(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    const ap = a.position;
    const bp = b.position;
    if (ap != null && bp != null) return ap - bp;
    if (ap != null) return -1;
    if (bp != null) return 1;
    return a.number - b.number;
  });
}

interface BoardState {
  statuses: Status[];
  items: WorkItem[];
}

export function BoardClient({ projectId }: { projectId: string }) {
  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statuses, items] = await Promise.all([
        listStatuses(projectId),
        listAllWorkItems(projectId),
      ]);
      setState({ statuses, items });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load board');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Map of statusId → ordered items, derived from the flat list. */
  const columns = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    if (!state) return map;
    for (const status of state.statuses) map.set(status.id, []);
    for (const item of state.items) {
      const bucket = map.get(item.statusId);
      if (bucket) bucket.push(item);
      else map.set(item.statusId, [item]);
    }
    for (const [k, v] of map) map.set(k, ordered(v));
    return map;
  }, [state]);

  const findItem = useCallback(
    (id: string): WorkItem | undefined => state?.items.find((i) => i.id === id),
    [state],
  );

  /** Resolve the column an over-target belongs to (a card id or an empty column id). */
  const columnIdOf = useCallback(
    (overId: string): string | null => {
      if (columns.has(overId)) return overId;
      const item = findItem(overId);
      return item ? item.statusId : null;
    },
    [columns, findItem],
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !state) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const dragged = findItem(activeId);
    if (!dragged) return;

    const targetStatusId = columnIdOf(overId);
    if (!targetStatusId) return;

    // Build the target column's order WITHOUT the dragged card, then find the drop slot.
    const targetItems = ordered(
      state.items.filter((i) => i.statusId === targetStatusId && i.id !== activeId),
    );
    let insertIndex = targetItems.length;
    if (overId !== targetStatusId) {
      const overIdx = targetItems.findIndex((i) => i.id === overId);
      if (overIdx !== -1) insertIndex = overIdx;
    }

    const afterId = insertIndex > 0 ? targetItems[insertIndex - 1]?.id : undefined;
    const beforeId = insertIndex < targetItems.length ? targetItems[insertIndex]?.id : undefined;

    // No-op: same column, same slot.
    if (targetStatusId === dragged.statusId && afterId === undefined && beforeId === undefined) {
      const onlySelf =
        ordered(state.items.filter((i) => i.statusId === targetStatusId)).length <= 1;
      if (onlySelf) return;
    }

    try {
      setBusy(true);
      await moveWorkItem(activeId, {
        version: dragged.version,
        statusId: targetStatusId !== dragged.statusId ? targetStatusId : undefined,
        afterId,
        beforeId,
      });
      // Re-read so fractional positions + status reflect the server's authoritative state.
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  }

  async function onQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = quickAdd.trim();
    if (!value || busy) return;
    try {
      setBusy(true);
      await createWorkItem({ projectId, quickAdd: value });
      setQuickAdd('');
      await load();
    } catch (e2) {
      setError(e2 instanceof ApiError ? e2.message : 'Capture failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) {
    return (
      <main>
        <h1>Board</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main>
        <h1>Board</h1>
        <p>Loading board…</p>
      </main>
    );
  }

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Board</h1>
        <nav>
          <Link href={`/projects/${projectId}/list`}>List view</Link>
        </nav>
      </header>

      <form onSubmit={onQuickAdd} aria-label="Quick add work item">
        <input
          type="text"
          data-testid="quick-add-input"
          aria-label="Quick add"
          placeholder="Capture a task…  @assignee #label !priority ^date"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !quickAdd.trim()}>
          Add
        </button>
      </form>

      {error ? <p role="alert">{error}</p> : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div
          style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', overflowX: 'auto' }}
          aria-label="Board columns"
        >
          {state.statuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              items={columns.get(status.id) ?? []}
              onSelect={setSelected}
            />
          ))}
        </div>
      </DndContext>

      {selected ? (
        <WorkItemDetail
          item={selected}
          statuses={state.statuses}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

function BoardColumn({
  status,
  items,
  onSelect,
}: {
  status: Status;
  items: WorkItem[];
  onSelect: (item: WorkItem) => void;
}) {
  return (
    <section
      data-testid="board-column"
      aria-label={`${status.name} column`}
      style={{
        minWidth: 260,
        background: '#f4f5f7',
        borderRadius: 8,
        padding: '0.75rem',
      }}
    >
      <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>
        {status.name} <span aria-label="item count">({items.length})</span>
      </h2>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        id={status.id}
      >
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, minHeight: 24 }}>
          {items.map((item) => (
            <BoardCard key={item.id} item={item} onSelect={onSelect} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function BoardCard({
  item,
  onSelect,
}: {
  item: WorkItem;
  onSelect: (item: WorkItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: '#fff',
    border: '1px solid #d9dce0',
    borderRadius: 6,
    padding: '0.5rem 0.625rem',
    marginBottom: '0.5rem',
    cursor: 'grab',
  };

  return (
    <li ref={setNodeRef} style={style} data-testid="board-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={() => onSelect(item)}
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit',
            flex: 1,
          }}
        >
          {item.title}
        </button>
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${item.title}`}
          style={{
            border: 0,
            background: 'transparent',
            cursor: 'grab',
            userSelect: 'none',
            font: 'inherit',
            padding: 0,
          }}
        >
          ⠿
        </button>
      </div>
      <small style={{ color: '#666' }}>
        <code>{item.key}</code>
        {item.priority !== 'NONE' ? ` · ${item.priority}` : ''}
        {item.overdue ? ' · overdue' : ''}
      </small>
    </li>
  );
}
