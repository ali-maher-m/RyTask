'use client';

import {
  EMPTY_FILTER_BAR_VALUE,
  FilterBar,
  type FilterBarValue,
  type GroupField,
  type SaveViewInput,
  type SortField,
  type WorkItemQuery,
} from '@/components/filter-bar';
import { ItemDetail } from '@/components/item-detail';
import { SurfaceFeedback, SurfaceLoading } from '@/components/surface-feedback';
import { type MappedError, listLabels, listProjectMembers, mapApiError } from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useSession } from '@/lib/auth/session-context';
import {
  type ViewConfig,
  carryOverHref,
  decodeSort,
  parseViewConfig,
  viewConfigToWorkItemQuery,
} from '@/lib/views/view-config';
import {
  type Label,
  PRIORITIES,
  type Priority,
  type ProjectRoleDto,
  type Status,
  type WorkItem,
} from '@rytask/contracts';
import { Dialog, EmptyState } from '@rytask/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  createWorkItem,
  listAllWorkItems,
  listStatuses,
  saveView,
  updateWorkItem,
} from '../api-client';

/**
 * List view (US4, T051, FR-WEB-031/032, D15/D16). Renders one editable row per item over the same
 * query path as the Board: inline edits (title / priority / due) call `PATCH /work-items/{id}` with
 * the optimistic `version` and replace just that row (no full reload); a stale `version` reconciles
 * via a kind 409 message. The active filter/group/sort is read from (and carried to the Board via)
 * the URL — switching Board↔List preserves the view. When a group is selected the rows render in
 * labelled sections (priority sections order Urgent→None); a long ungrouped list virtualizes past
 * ~80 rows. Token-only; a native, accessible `<table>` keeps every cell a labelled control.
 */

const PRIORITY_LABELS: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'No priority',
};
const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/** Columns rendered per row (kept in sync with the spacer-row colSpan in the virtual path). */
const COLUMN_COUNT = 6;
/** A long ungrouped list virtualizes; small/grouped lists render in full (tests, demo). */
const VIRTUALIZE_THRESHOLD = 80;

interface Section {
  key: string;
  label: string;
  items: WorkItem[];
}

interface ListState {
  statuses: Status[];
  items: WorkItem[];
}

/** Split items into labelled, ordered sections for the selected group (or one "All" section). */
function buildSections(
  items: WorkItem[],
  group: GroupField,
  statuses: Status[],
  labels: Label[],
): Section[] {
  if (!group) return [{ key: 'all', label: 'All', items }];

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const buckets = new Map<string, Section>();

  const keyLabel = (item: WorkItem): { key: string; label: string; sortHint: number | string } => {
    switch (group) {
      case 'status': {
        const s = statusById.get(item.statusId);
        return {
          key: item.statusId,
          label: s?.name ?? item.statusId,
          sortHint: s?.position ?? 999,
        };
      }
      case 'priority':
        return {
          key: item.priority,
          label: PRIORITY_LABELS[item.priority],
          sortHint: PRIORITY_ORDER[item.priority],
        };
      case 'assignee':
        return item.assigneeId
          ? { key: item.assigneeId, label: item.assigneeId, sortHint: item.assigneeId }
          : { key: '∅', label: 'Unassigned', sortHint: '￿' };
      case 'label': {
        const first = item.labelIds?.[0];
        return first
          ? { key: first, label: labelById.get(first)?.name ?? first, sortHint: first }
          : { key: '∅', label: 'No label', sortHint: '￿' };
      }
      default:
        return { key: item.projectId, label: 'Project', sortHint: item.projectId };
    }
  };

  const order: { key: string; sortHint: number | string }[] = [];
  for (const item of items) {
    const { key, label, sortHint } = keyLabel(item);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, items: [] };
      buckets.set(key, bucket);
      order.push({ key, sortHint });
    }
    bucket.items.push(item);
  }
  order.sort((a, b) => {
    if (typeof a.sortHint === 'number' && typeof b.sortHint === 'number')
      return a.sortHint - b.sortHint;
    return String(a.sortHint).localeCompare(String(b.sortHint));
  });
  // biome-ignore lint/style/noNonNullAssertion: every ordered key has a bucket
  return order.map((o) => buckets.get(o.key)!);
}

export function ListClient({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const cfg: ViewConfig = useMemo(() => parseViewConfig(searchParams, 'list'), [searchParams]);

  // Seed the filter bar's group + sort from the URL so a carried-over view is reflected in the UI;
  // the compound filter itself (base64 AST) is carried opaquely in the query (US7 decodes it to the
  // builder). The read query is derived from the same config.
  const initialBarValue = useMemo<FilterBarValue>(
    () => ({
      ...EMPTY_FILTER_BAR_VALUE,
      smart: (cfg.smart as FilterBarValue['smart']) ?? '',
      group: (cfg.group as GroupField) ?? '',
      sort: decodeSort(cfg.sort).map((k) => ({ field: k.field as SortField, dir: k.dir })),
    }),
    [cfg],
  );

  const { can } = useCapabilities();
  const { principal } = useSession();
  const [state, setState] = useState<ListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<MappedError | null>(null);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [projectRole, setProjectRole] = useState<ProjectRoleDto | undefined>(undefined);
  const [quickAdd, setQuickAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterValue, setFilterValue] = useState<FilterBarValue>(initialBarValue);
  const [group, setGroup] = useState<GroupField>(initialBarValue.group);
  const [query, setQuery] = useState<WorkItemQuery>(() => ({
    ...viewConfigToWorkItemQuery(cfg, projectId),
    sort: cfg.sort ?? 'number',
  }));

  const load = useCallback(async () => {
    try {
      const [statuses, items] = await Promise.all([
        listStatuses(projectId),
        listAllWorkItems(projectId, { ...query, sort: query.sort ?? 'number' }),
      ]);
      setState({ statuses, items });
      setError(null);
      setLoadError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load list');
      setLoadError(mapApiError(e));
    }
  }, [projectId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listLabels()
      .then(setLabels)
      .catch(() => setLabels([]));
  }, []);

  // Resolve the principal's project role for cosmetic write gating (org OWNER/ADMIN bypass).
  useEffect(() => {
    const userId = principal?.user.id;
    if (!userId) return;
    listProjectMembers(projectId)
      .then((members) => setProjectRole(members.find((m) => m.userId === userId)?.role))
      .catch(() => setProjectRole(undefined));
  }, [projectId, principal]);

  const canWrite = can('workitem:write', { projectRole });

  const onFilterChange = useCallback((value: FilterBarValue) => {
    setFilterValue(value);
    setGroup(value.group);
  }, []);

  const onSaveView = useCallback(async (input: SaveViewInput) => {
    await saveView({
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      projectId: input.projectId ?? undefined,
      filters: input.filters,
      grouping: input.grouping,
      sort: input.sort,
    });
  }, []);

  const replaceItem = useCallback((updated: WorkItem) => {
    setState((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
    );
  }, []);

  const patch = useCallback(
    async (item: WorkItem, fields: Partial<Pick<WorkItem, 'title' | 'priority' | 'dueDate'>>) => {
      try {
        setBusy(true);
        const updated = await updateWorkItem(item.id, { version: item.version, ...fields });
        replaceItem(updated);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setError('This item changed elsewhere — reloading the latest.');
          await load();
        } else {
          setError(e instanceof ApiError ? e.message : 'Update failed');
        }
      } finally {
        setBusy(false);
      }
    },
    [replaceItem, load],
  );

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

  // The Board link carries the active filter/group/sort (one query path, FR-WEB-032).
  const boardHref = carryOverHref(projectId, 'board', {
    layout: 'board',
    filter: query.filter,
    smart: query.smart,
    group: query.group,
    sort: query.sort && query.sort !== 'number' ? query.sort : undefined,
  });

  if (!state) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>List</h1>
        {loadError ? (
          <SurfaceFeedback
            error={loadError}
            onRetry={load}
            action={
              <Link href="/projects" style={LINK}>
                Back to projects
              </Link>
            }
          />
        ) : (
          <SurfaceLoading label="Loading list…" />
        )}
      </main>
    );
  }

  const statusName = (id: string) => state.statuses.find((s) => s.id === id)?.name ?? id;
  const sections = buildSections(state.items, group, state.statuses, labels);
  const virtualize = !group && state.items.length > VIRTUALIZE_THRESHOLD;
  const rowApi: RowApi = { statusName, busy, canWrite, onPatch: patch, onOpen: setSelected };

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
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>List</h1>
        <nav style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Link href={boardHref} style={LINK}>
            Board view
          </Link>
          <Link href={`/projects/${projectId}/trash`} style={LINK}>
            Trash
          </Link>
        </nav>
      </header>

      <FilterBar
        projectId={projectId}
        value={filterValue}
        onChange={onFilterChange}
        onQueryChange={setQuery}
        onSaveView={onSaveView}
      />

      {canWrite ? (
        <form
          onSubmit={onQuickAdd}
          aria-label="Quick add work item"
          style={{ margin: 'var(--space-3) 0' }}
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
        <p
          data-testid="list-readonly"
          style={{ color: 'var(--fg-muted)', margin: 'var(--space-3) 0' }}
        >
          You have read-only access to this project.
        </p>
      )}

      {error ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}

      <div data-testid="work-item-list">
        {state.items.length === 0 ? (
          <EmptyState
            title="No work items yet"
            description={
              canWrite
                ? 'Capture one with the quick-add above to get started.'
                : 'Nothing matches this view yet.'
            }
          />
        ) : virtualize ? (
          <VirtualTable items={state.items} rowApi={rowApi} />
        ) : (
          <table style={TABLE}>
            <thead>
              <HeaderRow />
            </thead>
            {group ? (
              sections.map((sec) => (
                <tbody key={sec.key}>
                  <tr>
                    <th colSpan={COLUMN_COUNT} scope="colgroup" style={GROUP_HEAD}>
                      {sec.label}{' '}
                      <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                        ({sec.items.length})
                      </span>
                    </th>
                  </tr>
                  {sec.items.map((item) => (
                    <ListRow key={item.id} item={item} rowApi={rowApi} />
                  ))}
                </tbody>
              ))
            ) : (
              <tbody>
                {state.items.map((item) => (
                  <ListRow key={item.id} item={item} rowApi={rowApi} />
                ))}
              </tbody>
            )}
          </table>
        )}
      </div>

      {selected ? (
        <Dialog open variant="sheet" hideHeader onClose={() => setSelected(null)}>
          <ItemDetail
            item={selected}
            statuses={state.statuses}
            labels={labels}
            canEdit={canWrite}
            onChange={(updated) => {
              replaceItem(updated);
              setSelected(updated);
            }}
            onDeleted={(deleted) => {
              setState((prev) =>
                prev ? { ...prev, items: prev.items.filter((i) => i.id !== deleted.id) } : prev,
              );
              setSelected(null);
            }}
            onClose={() => setSelected(null)}
          />
        </Dialog>
      ) : null}
    </main>
  );
}

interface RowApi {
  statusName: (id: string) => string;
  busy: boolean;
  /** Cosmetic write gate — inline editing controls are disabled when false (US5, FR-WEB-100). */
  canWrite: boolean;
  onPatch: (
    item: WorkItem,
    fields: Partial<Pick<WorkItem, 'title' | 'priority' | 'dueDate'>>,
  ) => Promise<void>;
  onOpen: (item: WorkItem) => void;
}

/** Virtualized ungrouped rows in a native table (spacer-row windowing keeps valid table markup). */
function VirtualTable({ items, rowApi }: { items: WorkItem[]; rowApi: RowApi }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  return (
    <div ref={scrollRef} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
      <table style={TABLE}>
        <thead>
          <HeaderRow />
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} style={{ height: paddingTop, padding: 0 }} />
            </tr>
          ) : null}
          {virtualRows.map((row) => {
            const item = items[row.index];
            if (!item) return null;
            return <ListRow key={item.id} item={item} rowApi={rowApi} />;
          })}
          {paddingBottom > 0 ? (
            <tr>
              <td colSpan={COLUMN_COUNT} style={{ height: paddingBottom, padding: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function HeaderRow() {
  return (
    <tr>
      <th scope="col" style={HEAD}>
        Key
      </th>
      <th scope="col" style={HEAD}>
        Title
      </th>
      <th scope="col" style={HEAD}>
        Status
      </th>
      <th scope="col" style={HEAD}>
        Priority
      </th>
      <th scope="col" style={HEAD}>
        Due
      </th>
      <th scope="col" style={HEAD}>
        Open
      </th>
    </tr>
  );
}

function ListRow({ item, rowApi }: { item: WorkItem; rowApi: RowApi }) {
  const { statusName, busy, canWrite, onPatch, onOpen } = rowApi;
  const disabled = busy || !canWrite;
  const [title, setTitle] = useState(item.title);

  // Keep the local draft in sync when the row is replaced by a server response.
  useEffect(() => {
    setTitle(item.title);
  }, [item.title]);

  function commitTitle() {
    const next = title.trim();
    if (!next || next === item.title) {
      setTitle(item.title);
      return;
    }
    void onPatch(item, { title: next });
  }

  return (
    <tr data-testid="work-item-row" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <td style={CELL}>
        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>{item.key}</code>
      </td>
      <td style={CELL}>
        <input
          type="text"
          aria-label={`Title for ${item.key}`}
          value={title}
          disabled={disabled}
          readOnly={!canWrite}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            // Enter commits; Escape reverts the draft. (We intentionally don't programmatically
            // remove focus — the DOM focus-out method trips the brand gate's CSS-blur scanner.)
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTitle();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setTitle(item.title);
            }
          }}
          style={{ ...CONTROL, width: '100%' }}
        />
      </td>
      <td style={{ ...CELL, color: 'var(--fg-muted)' }}>{statusName(item.statusId)}</td>
      <td style={CELL}>
        <label className="sr-only" htmlFor={`prio-${item.id}`}>
          Priority for {item.key}
        </label>
        <select
          id={`prio-${item.id}`}
          value={item.priority}
          disabled={disabled}
          onChange={(e) => void onPatch(item, { priority: e.target.value as Priority })}
          style={CONTROL}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </td>
      <td style={CELL}>
        <label className="sr-only" htmlFor={`due-${item.id}`}>
          Due date for {item.key}
        </label>
        <input
          id={`due-${item.id}`}
          type="date"
          value={item.dueDate ?? ''}
          disabled={disabled}
          onChange={(e) => void onPatch(item, { dueDate: e.target.value || null })}
          style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
        />
      </td>
      <td style={CELL}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`Open ${item.key}`}
          style={CONTROL}
        >
          Open
        </button>
      </td>
    </tr>
  );
}

// ── Token-only inline styles ────────────────────────────────────────────────────────────────────
const MAIN: React.CSSProperties = { padding: 'var(--space-4)' };
const LINK: React.CSSProperties = { color: 'var(--accent)' };
const TABLE: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
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
const GROUP_HEAD: React.CSSProperties = {
  ...CELL,
  fontSize: 'var(--fs-h3)',
  paddingTop: 'var(--space-4)',
};
const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
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
