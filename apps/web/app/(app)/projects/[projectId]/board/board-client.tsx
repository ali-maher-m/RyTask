'use client';

import { ItemDetail } from '@/components/item-detail';
import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { type MappedError, listLabels, listProjectMembers, mapApiError } from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useSession } from '@/lib/auth/session-context';
import {
  type ViewConfig,
  type ViewWorkItemQuery,
  carryOverHref,
  parseViewConfig,
  viewConfigToWorkItemQuery,
} from '@/lib/views/view-config';
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
import type { Label, ProjectRoleDto, Status, WorkItem } from '@rytask/contracts';
import { Dialog, Tooltip } from '@rytask/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GripVertical } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createWorkItem,
  listAllWorkItems,
  listStatuses,
  moveWorkItem,
} from '../api-client';

/**
 * Kanban Board (US4, T050, FR-WEB-030, D15/D16). Columns are the project's ordered statuses; cards
 * are grouped by `statusId` and ordered by fractional `position`. A drag is **optimistic**: the card
 * moves immediately, then `POST /work-items/{id}/move` persists the new column + fractional order
 * (the server computes the rank from neighbour anchors). On success we re-read so the persisted order
 * survives a reload; on a server refusal (`403` role-disallowed / `409` stale) the move **reverts**
 * with a kind, recoverable message — optimistic where safe, never a silent divergence. The active
 * view (filter/group/sort) is read from the URL and carries over to the List (one query path).
 * Columns virtualize past ~60 cards; built on `@dnd-kit`, keyboard + pointer accessible.
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

/** A card list longer than this virtualizes (small boards — tests, demo — render in full). */
const VIRTUALIZE_THRESHOLD = 60;

interface BoardState {
  statuses: Status[];
  items: WorkItem[];
}

/** A kind, recoverable message for a server-refused move (revert reason). */
function moveRevertMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'You don’t have permission to move this item, so it was put back.';
  }
  if (error instanceof ApiError && error.status === 409) {
    return 'This item changed elsewhere — your move was undone. Refresh to see the latest.';
  }
  return 'Couldn’t move the item just now, so it was put back.';
}

/**
 * Board data + optimistic-move engine (exported for the component test, T048). Loads statuses +
 * items for `query`, and exposes a `move(activeId, overId)` that optimistically reorders locally and
 * reconciles with — or reverts to — the server's authoritative state.
 */
export function useBoard(projectId: string, query?: ViewWorkItemQuery) {
  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The first-load failure is mapped to a surface kind (forbidden/not-found/error) so the page can
  // render a tenant-safe SurfaceState with zero foreign data (FR-WEB-101, D10). `error` stays the
  // inline message channel for optimistic-move reverts (kept identical for the component test).
  const [loadError, setLoadError] = useState<MappedError | null>(null);

  const reload = useCallback(async () => {
    try {
      const [statuses, items] = await Promise.all([
        listStatuses(projectId),
        listAllWorkItems(projectId, query ?? { projectId }),
      ]);
      setState({ statuses, items });
      setError(null);
      setLoadError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load board');
      setLoadError(mapApiError(e));
    }
  }, [projectId, query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const applyItem = useCallback((updated: WorkItem) => {
    setState((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setState((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev));
  }, []);

  const move = useCallback(
    async (activeId: string, overId: string) => {
      if (!state) return;
      const dragged = state.items.find((i) => i.id === activeId);
      if (!dragged) return;

      const isColumn = state.statuses.some((s) => s.id === overId);
      const overItem = state.items.find((i) => i.id === overId);
      const targetStatusId = isColumn ? overId : (overItem?.statusId ?? null);
      if (!targetStatusId) return;

      // Build the target column's order WITHOUT the dragged card, then find the drop slot.
      const targetItems = ordered(
        state.items.filter((i) => i.statusId === targetStatusId && i.id !== activeId),
      );
      let insertIndex = targetItems.length;
      if (!isColumn) {
        const overIdx = targetItems.findIndex((i) => i.id === overId);
        if (overIdx !== -1) insertIndex = overIdx;
      }
      const afterId = insertIndex > 0 ? targetItems[insertIndex - 1]?.id : undefined;
      const beforeId = insertIndex < targetItems.length ? targetItems[insertIndex]?.id : undefined;

      // No-op: same column, no neighbour change, and it's the only/last card there.
      if (targetStatusId === dragged.statusId && afterId === undefined && beforeId === undefined) {
        const onlySelf =
          ordered(state.items.filter((i) => i.statusId === targetStatusId)).length <= 1;
        if (onlySelf) return;
      }

      // Optimistically reflect the new column right away (exact order reconciles on reload).
      const snapshot = state;
      setState({
        ...state,
        items: state.items.map((i) => (i.id === activeId ? { ...i, statusId: targetStatusId } : i)),
      });
      setError(null);

      try {
        await moveWorkItem(activeId, {
          version: dragged.version,
          statusId: targetStatusId !== dragged.statusId ? targetStatusId : undefined,
          afterId,
          beforeId,
        });
        // Re-read so fractional positions + status reflect the server's authoritative state.
        await reload();
      } catch (e) {
        setState(snapshot); // revert the optimistic move
        setError(moveRevertMessage(e));
      }
    },
    [state, reload],
  );

  return { state, error, setError, loadError, reload, move, applyItem, removeItem } as const;
}

export function BoardClient({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const cfg: ViewConfig = useMemo(() => parseViewConfig(searchParams, 'board'), [searchParams]);
  const query = useMemo(() => viewConfigToWorkItemQuery(cfg, projectId), [cfg, projectId]);

  const { state, error, loadError, reload, move, applyItem, removeItem } = useBoard(
    projectId,
    query,
  );
  const { can } = useCapabilities();
  const { principal } = useSession();
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [projectRole, setProjectRole] = useState<ProjectRoleDto | undefined>(undefined);
  const [quickAdd, setQuickAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  // Labels power the detail drawer's label picker; non-critical, load best-effort.
  useEffect(() => {
    listLabels()
      .then(setLabels)
      .catch(() => setLabels([]));
  }, []);

  // Resolve the principal's project role so write gating mirrors the RBAC matrix (org OWNER/ADMIN
  // bypass it; an org MEMBER needs project MEMBER+). Best-effort — the server stays authoritative.
  useEffect(() => {
    const userId = principal?.user.id;
    if (!userId) return;
    listProjectMembers(projectId)
      .then((members) => setProjectRole(members.find((m) => m.userId === userId)?.role))
      .catch(() => setProjectRole(undefined));
  }, [projectId, principal]);

  // Cosmetic write gate (US5, FR-WEB-100). A refused drag/edit still reverts gracefully server-side.
  const canWrite = can('workitem:write', { projectRole });
  const writeReason = can('workitem:write') ? '' : 'You need edit access to this project.';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  async function onDragEnd(event: DragEndEvent) {
    if (!canWrite) return; // cosmetic guard; a slipped-through move still reverts on a server 403
    const { active, over } = event;
    if (!over) return;
    await move(String(active.id), String(over.id));
  }

  async function onQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = quickAdd.trim();
    if (!value || busy) return;
    try {
      setBusy(true);
      setQuickAddError(null);
      await createWorkItem({ projectId, quickAdd: value });
      setQuickAdd('');
      await reload();
    } catch (e2) {
      setQuickAddError(e2 instanceof ApiError ? e2.message : 'Capture failed');
    } finally {
      setBusy(false);
    }
  }

  if (!state) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Board</h1>
        {loadError ? (
          <SurfaceFeedback
            error={loadError}
            onRetry={reload}
            action={
              <Link href="/projects" style={LINK}>
                Back to projects
              </Link>
            }
          />
        ) : (
          <SurfaceLoading label="Loading board…" />
        )}
      </main>
    );
  }

  return (
    <main style={MAIN}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--space-3)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Board</h1>
        <nav style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Link href={carryOverHref(projectId, 'list', cfg)} style={LINK}>
            List view
          </Link>
          <Link href={`/projects/${projectId}/trash`} style={LINK}>
            Trash
          </Link>
        </nav>
      </header>

      {canWrite ? (
        <form
          onSubmit={onQuickAdd}
          aria-label="Quick add work item"
          style={{ marginBottom: 'var(--space-3)' }}
        >
          <input
            type="text"
            data-testid="quick-add-input"
            aria-label="Quick add"
            placeholder="Capture a task…  @assignee #label !priority ^date"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            disabled={busy}
            style={{ ...CONTROL, minWidth: 'min(420px, 100%)' }}
          />
          <button type="submit" disabled={busy || !quickAdd.trim()} style={ADD_BUTTON}>
            Add
          </button>
        </form>
      ) : (
        <Tooltip content={writeReason}>
          <p
            data-testid="board-readonly"
            style={{ color: 'var(--fg-muted)', margin: '0 0 var(--space-3)' }}
          >
            You have read-only access to this project.
          </p>
        </Tooltip>
      )}

      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}
      {quickAddError ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {quickAddError}
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            alignItems: 'flex-start',
            overflowX: 'auto',
          }}
          aria-label="Board columns"
        >
          {state.statuses.map((status) => (
            <BoardColumn
              key={status.id}
              status={status}
              items={columns.get(status.id) ?? []}
              onSelect={setSelected}
              canDrag={canWrite}
            />
          ))}
        </div>
      </DndContext>

      {selected ? (
        <Dialog open variant="sheet" hideHeader onClose={() => setSelected(null)}>
          <ItemDetail
            item={selected}
            statuses={state.statuses}
            labels={labels}
            canEdit={canWrite}
            editReason={writeReason || undefined}
            onChange={(updated) => {
              applyItem(updated);
              setSelected(updated);
            }}
            onDeleted={(deleted) => {
              removeItem(deleted.id);
              setSelected(null);
            }}
            onClose={() => setSelected(null)}
          />
        </Dialog>
      ) : null}
    </main>
  );
}

function BoardColumn({
  status,
  items,
  onSelect,
  canDrag,
}: {
  status: Status;
  items: WorkItem[];
  onSelect: (item: WorkItem) => void;
  /** Whether cards may be dragged (cosmetic — the server still authorizes the move). */
  canDrag: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = items.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  return (
    <section
      data-testid="board-column"
      aria-label={`${status.name} column`}
      style={{
        minWidth: 260,
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
      }}
    >
      <h2 style={{ fontSize: 'var(--fs-sm)', margin: '0 0 var(--space-2)' }}>
        {status.name} <span aria-label="item count">({items.length})</span>
      </h2>
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        id={status.id}
      >
        {virtualize ? (
          <div
            ref={scrollRef}
            style={{ maxHeight: '70vh', overflowY: 'auto' }}
            aria-label={`${status.name} cards`}
          >
            <ul
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
                listStyle: 'none',
                margin: 0,
                padding: 0,
              }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const item = items[row.index];
                if (!item) return null;
                return (
                  <BoardCard
                    key={item.id}
                    item={item}
                    onSelect={onSelect}
                    canDrag={canDrag}
                    positionStyle={{ position: 'absolute', top: row.start, left: 0, width: '100%' }}
                  />
                );
              })}
            </ul>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, minHeight: 24 }}>
            {items.map((item) => (
              <BoardCard key={item.id} item={item} onSelect={onSelect} canDrag={canDrag} />
            ))}
          </ul>
        )}
      </SortableContext>
    </section>
  );
}

function BoardCard({
  item,
  onSelect,
  canDrag,
  positionStyle,
}: {
  item: WorkItem;
  onSelect: (item: WorkItem) => void;
  canDrag: boolean;
  /** Absolute placement supplied by the column virtualizer (omitted in the non-virtual path). */
  positionStyle?: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2) var(--space-3)',
    marginBottom: 'var(--space-2)',
    ...positionStyle,
  };

  return (
    <li ref={setNodeRef} style={style} data-testid="board-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <button type="button" onClick={() => onSelect(item)} style={CARD_TITLE_BUTTON}>
          {item.title}
        </button>
        {canDrag ? (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${item.title}`}
            style={{
              border: 0,
              background: 'transparent',
              cursor: 'grab',
              color: 'var(--fg-muted)',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <GripVertical size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <small style={{ color: 'var(--fg-muted)' }}>
        <code style={{ fontFamily: 'var(--font-mono)' }}>{item.key}</code>
        {item.priority !== 'NONE' ? ` · ${item.priority}` : ''}
        {item.overdue ? ' · overdue' : ''}
      </small>
    </li>
  );
}

// ── Token-only inline styles ────────────────────────────────────────────────────────────────────
const MAIN: React.CSSProperties = { padding: 'var(--space-4)' };
const LINK: React.CSSProperties = { color: 'var(--accent)' };
const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2)',
};
const ADD_BUTTON: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg-on-accent)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-2) var(--space-3)',
  marginLeft: 'var(--space-2)',
  cursor: 'pointer',
};
const CARD_TITLE_BUTTON: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  padding: 0,
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  color: 'var(--fg)',
  flex: 1,
};
